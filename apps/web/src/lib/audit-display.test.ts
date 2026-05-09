import { describe, expect, it } from 'vitest';
import {
  listAuditFieldChanges,
  sanitizeAuditSnapshotForDisplay,
} from './audit-display';

describe('sanitizeAuditSnapshotForDisplay', () => {
  it('removes known Prisma relation blobs', () => {
    const raw = {
      id: 'r1',
      isActive: true,
      bank: { id: 1, name: 'Test' },
      group: { id: 'g1' },
    };
    const cleaned = sanitizeAuditSnapshotForDisplay(raw);
    expect(cleaned).not.toHaveProperty('bank');
    expect(cleaned).not.toHaveProperty('group');
    expect(cleaned?.id).toBe('r1');
    expect(cleaned?.isActive).toBe(true);
  });

  it('returns null for nullish input', () => {
    expect(sanitizeAuditSnapshotForDisplay(null)).toBeNull();
    expect(sanitizeAuditSnapshotForDisplay(undefined)).toBeNull();
  });
});

describe('listAuditFieldChanges', () => {
  it('lists differing keys between two snapshots', () => {
    const oldSanitized = sanitizeAuditSnapshotForDisplay({
      isActive: true,
      limitTotalOps: 100,
      bank: { id: 1 },
    })!;
    const newSanitized = sanitizeAuditSnapshotForDisplay({
      isActive: false,
      limitTotalOps: 100,
      disabledReason: 'MANUAL',
      bank: { id: 2 },
    })!;
    const changes = listAuditFieldChanges(oldSanitized, newSanitized);
    const fields = changes.map((c) => c.field).sort();
    expect(fields).toEqual(['disabledReason', 'isActive']);
  });
});
