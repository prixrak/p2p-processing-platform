import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@p2p/shared';
import { FilesService } from './files.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@p2p/config', () => ({
  config: {
    s3: {
      bucket: 'test-bucket',
      region: 'eu-central-1',
      endpoint: undefined,
      forcePathStyle: false,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
    },
  },
}));

/** Builds a `PrismaService`-shaped mock with controllable counters. */
function buildPrismaMock(opts: {
  file?: { id: string; s3Key: string; uploadedBy: string | null; originalName?: string; mimeType?: string; sizeBytes?: number } | null;
  counts?: {
    appealProof?: number;
    payinPayerPaymentProof?: number;
    payinForkChatProof?: number;
    bank?: number;
    payoutOrder?: number;
    payoutCompletionProofAttachment?: number;
  };
  fileDelete?: jest.Mock;
} = {}) {
  const file = opts.file ?? null;
  const counts = {
    appealProof: 0,
    payinPayerPaymentProof: 0,
    payinForkChatProof: 0,
    bank: 0,
    payoutOrder: 0,
    payoutCompletionProofAttachment: 0,
    ...opts.counts,
  };
  return {
    file: {
      findUnique: jest.fn().mockResolvedValue(file),
      delete: opts.fileDelete ?? jest.fn().mockResolvedValue(file),
    },
    appealProof: { count: jest.fn().mockResolvedValue(counts.appealProof) },
    payinPayerPaymentProof: {
      count: jest.fn().mockResolvedValue(counts.payinPayerPaymentProof),
    },
    payinForkChatProof: { count: jest.fn().mockResolvedValue(counts.payinForkChatProof) },
    bank: { count: jest.fn().mockResolvedValue(counts.bank) },
    payoutOrder: { count: jest.fn().mockResolvedValue(counts.payoutOrder) },
    payoutCompletionProofAttachment: {
      count: jest.fn().mockResolvedValue(counts.payoutCompletionProofAttachment),
    },
  };
}

function buildService(prismaLike: ReturnType<typeof buildPrismaMock>) {
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const opsAlerts = { scheduleAlert: jest.fn().mockResolvedValue(undefined) };
  const svc = new FilesService(prismaLike as any, audit, opsAlerts as any);
  const s3Send = jest.fn().mockResolvedValue(undefined);
  (svc as any).s3 = { send: s3Send };
  return { svc, audit, s3Send };
}

describe('FilesService.findFileReferences', () => {
  it('reports each blocking reference once and does not duplicate the head column when an attachment row covers it', async () => {
    const prisma = buildPrismaMock({
      counts: {
        appealProof: 1,
        bank: 2,
        payoutCompletionProofAttachment: 1,
        // Head column mirrors the attachment row — should not surface as a separate reason.
        payoutOrder: 1,
      },
    });
    const { svc } = buildService(prisma);

    const refs = await svc.findFileReferences('00000000-0000-0000-0000-000000000001');

    expect(refs).toEqual(['appeal proof', 'bank logo', 'pay-out completion proof']);
  });

  it('reports the standalone head column when no attachment rows reference the file', async () => {
    const prisma = buildPrismaMock({
      counts: { payoutOrder: 1 },
    });
    const { svc } = buildService(prisma);

    const refs = await svc.findFileReferences('00000000-0000-0000-0000-000000000002');

    expect(refs).toEqual(['pay-out completion proof (single-column)']);
  });

  it('returns an empty list for an orphan', async () => {
    const prisma = buildPrismaMock();
    const { svc } = buildService(prisma);

    await expect(
      svc.findFileReferences('00000000-0000-0000-0000-000000000003'),
    ).resolves.toEqual([]);
  });
});

describe('FilesService.deleteOrphanFile', () => {
  const fileRow = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    s3Key: 'uploads/aaa-receipt.png',
    uploadedBy: 'user-1',
    originalName: 'receipt.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
  };

  it('refuses with NotFound when the file row is missing', async () => {
    const prisma = buildPrismaMock({ file: null });
    const { svc } = buildService(prisma);

    await expect(
      svc.deleteOrphanFile({ id: 'user-1', role: UserRole.TRADER }, fileRow.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses with Forbidden when a non-staff user tries to delete someone else’s upload', async () => {
    const prisma = buildPrismaMock({ file: { ...fileRow, uploadedBy: 'someone-else' } });
    const { svc, audit, s3Send } = buildService(prisma);

    await expect(
      svc.deleteOrphanFile({ id: 'user-1', role: UserRole.TRADER }, fileRow.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(s3Send).not.toHaveBeenCalled();
    expect(prisma.file.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('allows admins to delete uploads belonging to other users', async () => {
    const prisma = buildPrismaMock({ file: { ...fileRow, uploadedBy: 'someone-else' } });
    const { svc, audit, s3Send } = buildService(prisma);

    await svc.deleteOrphanFile({ id: 'admin-1', role: UserRole.ADMIN }, fileRow.id);

    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: fileRow.id } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FILE_DELETED',
        entityType: 'File',
        entityId: fileRow.id,
      }),
    );
  });

  it('refuses with Conflict when the file is still referenced and never touches S3 or the audit log', async () => {
    const prisma = buildPrismaMock({
      file: fileRow,
      counts: { appealProof: 1 },
    });
    const { svc, audit, s3Send } = buildService(prisma);

    await expect(
      svc.deleteOrphanFile({ id: 'user-1', role: UserRole.TRADER }, fileRow.id),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(s3Send).not.toHaveBeenCalled();
    expect(prisma.file.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('deletes from S3 first, then from the DB, then writes an audit record', async () => {
    const callOrder: string[] = [];
    const prisma = buildPrismaMock({ file: fileRow });
    prisma.file.delete = jest.fn().mockImplementation(async () => {
      callOrder.push('db');
      return fileRow;
    });
    const { svc, audit, s3Send } = buildService(prisma);
    s3Send.mockImplementation(async () => {
      callOrder.push('s3');
    });
    audit.log.mockImplementation(async () => {
      callOrder.push('audit');
    });

    await svc.deleteOrphanFile({ id: 'user-1', role: UserRole.TRADER }, fileRow.id);

    expect(callOrder).toEqual(['s3', 'db', 'audit']);
  });

  it('skips ownership when the caller passes `skipOwnershipCheck` (used by payout detach)', async () => {
    const prisma = buildPrismaMock({ file: { ...fileRow, uploadedBy: 'someone-else' } });
    const { svc } = buildService(prisma);

    await expect(
      svc.deleteOrphanFile(
        { id: 'specialist-1', role: UserRole.PAYOUT_TRADER },
        fileRow.id,
        { skipOwnershipCheck: true },
      ),
    ).resolves.toBeUndefined();
  });
});
