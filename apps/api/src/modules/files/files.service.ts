import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../config/prisma.service';
import { config } from '@p2p/config';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, UserRole } from '@p2p/shared';
import { logExternalFailure, summarizeExternalError } from '../../common/utils/external-error-log';
import { AuditService } from '../audit/audit.service';
import { OpsAlertsService } from '../ops-alerts/ops-alerts.service';

/** JWT user payload passed from FilesController — used for file download authorization */
export interface FileDownloadActor {
  id: string;
  role: string;
  traderId?: string | null;
  payoutTraderId?: string | null;
  merchantId?: string | null;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly opsAlerts: OpsAlertsService,
  ) {
    this.bucket = config.s3.bucket;
    this.s3 = new S3Client({
      region: config.s3.region,
      ...(config.s3.endpoint && { endpoint: config.s3.endpoint }),
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
  }

  /** Correlation fields for S3 errors (PermanentRedirect usually means wrong region vs bucket). */
  private s3ClientLogContext(): Record<string, unknown> {
    const raw = config.s3.endpoint?.trim();
    let endpointOrigin: string | undefined;
    if (raw) {
      try {
        endpointOrigin = new URL(raw).origin;
      } catch {
        endpointOrigin = 'invalid-url';
      }
    }
    return {
      s3Region: config.s3.region,
      s3ForcePathStyle: config.s3.forcePathStyle,
      ...(endpointOrigin && { s3EndpointOrigin: endpointOrigin }),
    };
  }

  private validateFile(mimetype: string, size: number): void {
    if (!ALLOWED_FILE_TYPES.includes(mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${mimetype}". Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`,
      );
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size ${size} exceeds the ${MAX_FILE_SIZE_BYTES} byte limit`,
      );
    }
  }

  private async uploadToS3(
    s3Key: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<void> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimetype,
        }),
      );
    } catch (err) {
      logExternalFailure(this.logger, {
        integration: 'AWS S3',
        operation: 'PutObject',
        context: {
          bucket: this.bucket,
          keyByteLength: Buffer.byteLength(s3Key, 'utf8'),
          bodyBytes: buffer.length,
          contentType: mimetype,
          ...this.s3ClientLogContext(),
        },
        error: err,
      });
      const summary = summarizeExternalError(err);
      void this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'AWS S3 PutObject failed',
        lines: [
          'File upload could not be stored in object storage.',
          `Bucket: ${this.bucket}`,
          ...(summary.errorMessage
            ? [`Error: ${summary.errorMessage.slice(0, 240)}`]
            : []),
        ],
        fingerprint: 's3:PutObject',
      });
      throw err;
    }
  }

  // ─── Used by PayinService (batch save for proofs) ───

  async saveFiles(
    files: UploadedFile[],
    uploadedBy?: string,
  ): Promise<string[]> {
    const fileIds: string[] = [];

    for (const file of files) {
      this.validateFile(file.mimetype, file.size);

      const s3Key = `uploads/${randomUUID()}-${file.originalname}`;
      await this.uploadToS3(s3Key, file.buffer, file.mimetype);

      const record = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          s3Key,
          uploadedBy,
        },
      });

      fileIds.push(record.id);
    }

    return fileIds;
  }

  async getFilesByIds(ids: string[]) {
    return this.prisma.file.findMany({
      where: { id: { in: ids } },
    });
  }

  // ─── Controller endpoints ───

  async upload(file: Express.Multer.File, uploadedBy?: string) {
    this.validateFile(file.mimetype, file.size);

    const s3Key = `uploads/${randomUUID()}-${file.originalname}`;
    await this.uploadToS3(s3Key, file.buffer, file.mimetype);

    return this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key,
        uploadedBy,
      },
    });
  }

  async uploadMultiple(files: Express.Multer.File[], uploadedBy?: string) {
    const results = [];
    for (const file of files) {
      results.push(await this.upload(file, uploadedBy));
    }
    return results;
  }

  /**
   * Enforces who may fetch a file by UUID (appeal proofs, payout completion proofs, uploader, staff).
   */
  async ensureUserCanAccessFile(
    actor: FileDownloadActor,
    file: { id: string; uploadedBy: string | null },
  ): Promise<void> {
    const staffRoles: string[] = [
      UserRole.ADMIN,
      UserRole.OWNER,
      UserRole.SUPPORT,
    ];
    if (staffRoles.includes(actor.role)) {
      return;
    }

    if (file.uploadedBy && file.uploadedBy === actor.id) {
      return;
    }

    if (actor.role === UserRole.TRADER) {
      if (!actor.traderId) {
        throw new ForbiddenException('File access denied');
      }
      const appealLinked = await this.prisma.appealProof.findFirst({
        where: {
          fileId: file.id,
          appeal: { payinOrder: { traderId: actor.traderId } },
        },
      });
      if (appealLinked) return;

      const forkChatLinked = await this.prisma.payinForkChatProof.findFirst({
        where: {
          fileId: file.id,
          payinOrder: { traderId: actor.traderId },
        },
      });
      if (forkChatLinked) return;

      const payerProofLinked = await this.prisma.payinPayerPaymentProof.findFirst({
        where: {
          fileId: file.id,
          payinOrder: { traderId: actor.traderId },
        },
      });
      if (payerProofLinked) return;

      const payoutOwned = await this.prisma.payoutOrder.findFirst({
        where: {
          traderId: actor.traderId,
          OR: [
            { completionProofFileId: file.id },
            { completionProofAttachments: { some: { fileId: file.id } } },
          ],
        },
      });
      if (payoutOwned) return;

      throw new ForbiddenException('File access denied');
    }

    if (actor.role === UserRole.MERCHANT) {
      if (!actor.merchantId) {
        throw new ForbiddenException('File access denied');
      }
      const linked = await this.prisma.appealProof.findFirst({
        where: {
          fileId: file.id,
          appeal: { payinOrder: { merchantId: actor.merchantId } },
        },
      });
      if (linked) return;

      const forkMerchantLinked = await this.prisma.payinForkChatProof.findFirst({
        where: {
          fileId: file.id,
          payinOrder: { merchantId: actor.merchantId },
        },
      });
      if (forkMerchantLinked) return;

      const payerProofMerchantLinked = await this.prisma.payinPayerPaymentProof.findFirst({
        where: {
          fileId: file.id,
          payinOrder: { merchantId: actor.merchantId },
        },
      });
      if (payerProofMerchantLinked) return;

      const payoutCompletionProof = await this.prisma.payoutOrder.findFirst({
        where: {
          merchantId: actor.merchantId,
          OR: [
            { completionProofFileId: file.id },
            { completionProofAttachments: { some: { fileId: file.id } } },
          ],
        },
      });
      if (payoutCompletionProof) return;

      throw new ForbiddenException('File access denied');
    }

    if (actor.role === UserRole.PAYOUT_TRADER) {
      if (!actor.payoutTraderId) {
        throw new ForbiddenException('File access denied');
      }
      const payout = await this.prisma.payoutOrder.findFirst({
        where: {
          payoutTraderId: actor.payoutTraderId,
          OR: [
            { completionProofFileId: file.id },
            { completionProofAttachments: { some: { fileId: file.id } } },
          ],
        },
      });
      if (payout) return;
      throw new ForbiddenException('File access denied');
    }

    throw new ForbiddenException('File access denied');
  }

  private async signFileObject(file: { id: string; s3Key: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: file.s3Key,
    });

    try {
      return await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    } catch (err) {
      logExternalFailure(this.logger, {
        integration: 'AWS S3',
        operation: 'getSignedUrl',
        context: {
          bucket: this.bucket,
          fileId: file.id,
          keyByteLength: Buffer.byteLength(file.s3Key, 'utf8'),
          ...this.s3ClientLogContext(),
        },
        error: err,
      });
      const summary = summarizeExternalError(err);
      void this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'AWS S3 presigned URL failed',
        lines: [
          'Could not generate a download URL.',
          `Bucket: ${this.bucket}`,
          `File ID: ${file.id}`,
          ...(summary.errorMessage
            ? [`Error: ${summary.errorMessage.slice(0, 240)}`]
            : []),
        ],
        fingerprint: 's3:getSignedUrl',
      });
      throw err;
    }
  }

  /** One DB round-trip + one signature; used by JSON endpoint so the SPA avoids a separate metadata request. */
  async getSignedUrlPayload(
    id: string,
    actor?: FileDownloadActor,
  ): Promise<{ url: string; mimeType: string }> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');

    if (actor) {
      await this.ensureUserCanAccessFile(actor, file);
    }

    const url = await this.signFileObject(file);
    return { url, mimeType: file.mimeType };
  }

  async getSignedUrl(id: string, actor?: FileDownloadActor): Promise<string> {
    const { url } = await this.getSignedUrlPayload(id, actor);
    return url;
  }

  async getMetadata(id: string, actor?: FileDownloadActor) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    if (actor) {
      await this.ensureUserCanAccessFile(actor, file);
    }
    return file;
  }

  /**
   * Best-effort S3 object removal. Logs and swallows errors so an already-detached DB row
   * does not leave the caller in a half-deleted state when S3 transient errors hit.
   */
  private async deleteFromS3(s3Key: string, context: { fileId: string }): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      );
    } catch (err) {
      logExternalFailure(this.logger, {
        integration: 'AWS S3',
        operation: 'DeleteObject',
        context: {
          bucket: this.bucket,
          fileId: context.fileId,
          keyByteLength: Buffer.byteLength(s3Key, 'utf8'),
          ...this.s3ClientLogContext(),
        },
        error: err,
      });
      const summary = summarizeExternalError(err);
      void this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'AWS S3 DeleteObject failed',
        lines: [
          'Could not remove object from storage during file deletion.',
          `Bucket: ${this.bucket}`,
          `File ID: ${context.fileId}`,
          ...(summary.errorMessage
            ? [`Error: ${summary.errorMessage.slice(0, 240)}`]
            : []),
        ],
        fingerprint: 's3:DeleteObject',
      });
      throw err;
    }
  }

  /**
   * Hard delete: removes the S3 object and DB row, but only when the file is not
   * referenced by any persistent record (appeal proof, pay-in payer payment proof, pay-in fork chat proof, bank logo,
   * pay-out completion proof attachment, or single-column `payout_orders.completion_proof_file_id`).
   *
   * Used by:
   *   - cabinets that want to drop a staged proof before it is committed to an order,
   *   - cabinets that want to detach a committed proof and physically remove the orphan.
   */
  async deleteOrphanFile(
    actor: { id: string; role: string },
    fileId: string,
    options: { skipOwnershipCheck?: boolean } = {},
  ): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    if (!options.skipOwnershipCheck) {
      const isStaff =
        actor.role === UserRole.ADMIN || actor.role === UserRole.OWNER;
      if (!isStaff && file.uploadedBy !== actor.id) {
        throw new ForbiddenException('File can be removed only by its uploader');
      }
    }

    const blockingRefs = await this.findFileReferences(fileId);
    if (blockingRefs.length > 0) {
      throw new ConflictException(
        `File is still attached to: ${blockingRefs.join(', ')}`,
      );
    }

    await this.deleteFromS3(file.s3Key, { fileId });
    await this.prisma.file.delete({ where: { id: fileId } });

    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'FILE_DELETED',
      entityType: 'File',
      entityId: fileId,
      oldValue: {
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        s3Key: file.s3Key,
        uploadedBy: file.uploadedBy,
      },
      newValue: null,
    });
  }

  /**
   * Detect any persistent record that would block a hard delete. Order matches the
   * `File` relations in `schema.prisma`; banks include both active and inactive.
   * Returns human-readable reasons for the `409` body.
   */
  async findFileReferences(fileId: string): Promise<string[]> {
    const [
      appealCount,
      payerProofCount,
      forkCount,
      bankCount,
      payoutHeadCount,
      payoutAttachmentCount,
    ] = await Promise.all([
      this.prisma.appealProof.count({ where: { fileId } }),
      this.prisma.payinPayerPaymentProof.count({ where: { fileId } }),
      this.prisma.payinForkChatProof.count({ where: { fileId } }),
      this.prisma.bank.count({ where: { logoFileId: fileId } }),
      this.prisma.payoutOrder.count({ where: { completionProofFileId: fileId } }),
      this.prisma.payoutCompletionProofAttachment.count({ where: { fileId } }),
    ]);

    const refs: string[] = [];
    if (appealCount > 0) refs.push('appeal proof');
    if (payerProofCount > 0) refs.push('pay-in payer payment proof');
    if (forkCount > 0) refs.push('pay-in fork chat proof');
    if (bankCount > 0) refs.push('bank logo');
    if (payoutAttachmentCount > 0) refs.push('pay-out completion proof');
    // Only surface the standalone head column when no attachment rows reference this file —
    // the head column mirrors the attachment list via syncPayoutCompletionProofHeadColumn.
    if (payoutAttachmentCount === 0 && payoutHeadCount > 0) {
      refs.push('pay-out completion proof (single-column)');
    }
    return refs;
  }
}
