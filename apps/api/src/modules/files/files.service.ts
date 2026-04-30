import {
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
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../config/prisma.service';
import { config } from '@p2p/config';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, UserRole } from '@p2p/shared';
import { logExternalFailure } from '../../common/utils/external-error-log';

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

  constructor(private readonly prisma: PrismaService) {
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

      const payoutOwned = await this.prisma.payoutOrder.findFirst({
        where: {
          completionProofFileId: file.id,
          traderId: actor.traderId,
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
      throw new ForbiddenException('File access denied');
    }

    if (actor.role === UserRole.PAYOUT_TRADER) {
      if (!actor.payoutTraderId) {
        throw new ForbiddenException('File access denied');
      }
      const payout = await this.prisma.payoutOrder.findFirst({
        where: {
          completionProofFileId: file.id,
          payoutTraderId: actor.payoutTraderId,
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
}
