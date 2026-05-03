'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { parseDecimalInput } from '@/lib/decimal-input';
import { errorMessageFromUnknown } from '@/lib/error-message';
import type { StaffRolePrefix } from '@/lib/query-keys';

interface ReferredUserRow {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

interface ReferralAgentDetail {
  id: string;
  userId: string;
  referralPercent: unknown;
  balance: unknown;
  currency: { code: string };
  user: { id: string; email: string; isActive: boolean; createdAt: string };
  referrals: ReferredUserRow[];
}

function numFromUnknown(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

const roleLabel: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.TRADER]: 'Trader',
  [UserRole.PAYOUT_TRADER]: 'Pay-Out specialist',
  [UserRole.MERCHANT]: 'Merchant',
  [UserRole.SUPPORT]: 'Support',
  [UserRole.REFERRAL]: 'Referral',
};

function detailQueryKey(prefix: StaffRolePrefix, profileId: string | null) {
  return [prefix, 'referral-agent-manage', profileId] as const;
}

export interface ReferralAgentManageModalProps {
  queryKeyPrefix: StaffRolePrefix;
  open: boolean;
  onClose: () => void;
  profileId: string | null;
  agentEmail: string;
  onChanged: () => void;
}

export function ReferralAgentManageModal({
  queryKeyPrefix,
  open,
  onClose,
  profileId,
  agentEmail,
  onChanged,
}: ReferralAgentManageModalProps) {
  const queryClient = useQueryClient();
  const [editPercent, setEditPercent] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [linkUserId, setLinkUserId] = useState('');
  const [pendingUnlink, setPendingUnlink] = useState<ReferredUserRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const detailQuery = detailQueryKey(queryKeyPrefix, profileId);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: detailQuery,
    queryFn: () => api.get<ReferralAgentDetail>(internalPaths.referral(profileId!)),
    enabled: open && Boolean(profileId),
  });

  useEffect(() => {
    if (!open) {
      setFormError(null);
      setLinkUserId('');
      setPendingUnlink(null);
    }
  }, [open]);

  useEffect(() => {
    if (!detail || profileId !== detail.id) return;
    setEditPercent(String(numFromUnknown(detail.referralPercent)));
    setEditCurrency(detail.currency.code);
  }, [detail, profileId]);

  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: detailQuery });
  };

  const updateMut = useMutation({
    mutationFn: () =>
      api.patch(internalPaths.referral(profileId!), {
        referralPercent: parseDecimalInput(editPercent),
        currency: editCurrency.trim() || undefined,
      }),
    onSuccess: () => {
      invalidateDetail();
      onChanged();
      setFormError(null);
    },
    onError: (e) => setFormError(errorMessageFromUnknown(e)),
  });

  const linkMut = useMutation({
    mutationFn: () =>
      api.post(internalPaths.referralLinkUser(profileId!), { userId: linkUserId.trim() }),
    onSuccess: () => {
      invalidateDetail();
      onChanged();
      setLinkUserId('');
      setFormError(null);
    },
    onError: (e) => setFormError(errorMessageFromUnknown(e)),
  });

  const unlinkMut = useMutation({
    mutationFn: (userId: string) => api.delete(internalPaths.referralUnlinkUser(userId)),
    onSuccess: () => {
      invalidateDetail();
      onChanged();
      setPendingUnlink(null);
      setFormError(null);
    },
    onError: (e) => setFormError(errorMessageFromUnknown(e)),
  });

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          onClose();
          setFormError(null);
        }}
        title={`Referral agent — ${agentEmail}`}
        size="lg"
      >
        {formError ? (
          <FormAlert tone="error" className="mb-3">
            {formError}
          </FormAlert>
        ) : null}
        {detailLoading || !detail ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="text-sm">
              <p>
                <span className="text-text-muted">Account:</span>{' '}
                <span className="font-medium text-text-primary">{detail.user.email}</span>
              </p>
              <p className="text-xs text-text-muted mt-1 font-mono">Profile ID: {detail.id}</p>
            </div>

            <div className="rounded-lg border border-border-subtle p-3 space-y-2">
              <h3 className="text-xs font-semibold uppercase text-text-muted">Commission settings</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="Commission %"
                  value={editPercent}
                  onChange={(e) => setEditPercent(e.target.value)}
                  inputMode="decimal"
                />
                <Input
                  label="Currency (code)"
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value.toUpperCase())}
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={updateMut.isPending}
                onClick={() => {
                  setFormError(null);
                  updateMut.mutate();
                }}
              >
                Save settings
              </Button>
            </div>

            <div className="rounded-lg border border-border-subtle p-3 space-y-2">
              <h3 className="text-xs font-semibold uppercase text-text-muted">Link existing user</h3>
              <p className="text-xs text-text-muted">
                Sets <code className="font-mono">referred_by</code> to this agent profile. User must not already be
                linked.
              </p>
              <Input
                label="User ID (UUID)"
                value={linkUserId}
                onChange={(e) => setLinkUserId(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={linkMut.isPending || !linkUserId.trim()}
                onClick={() => {
                  setFormError(null);
                  linkMut.mutate();
                }}
              >
                Link user
              </Button>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">Linked users</h3>
              {detail.referrals.length === 0 ? (
                <p className="text-sm text-text-muted">No linked users yet.</p>
              ) : (
                <ul className="text-sm space-y-2">
                  {detail.referrals.map((u) => (
                    <li
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle/60 px-2 py-1.5"
                    >
                      <span className="text-text-primary truncate">{u.email}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="default">{roleLabel[u.role] ?? u.role}</Badge>
                        <Button type="button" variant="danger" size="sm" onClick={() => setPendingUnlink(u)}>
                          Unlink
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingUnlink)}
        onOpenChange={(next) => {
          if (!next) setPendingUnlink(null);
        }}
        tone="danger"
        title="Unlink user from this agent?"
        description={
          pendingUnlink ? (
            <>
              <span className="font-medium text-text-primary">{pendingUnlink.email}</span> will no longer count toward
              this referral agent.
            </>
          ) : null
        }
        confirmLabel="Unlink"
        loading={unlinkMut.isPending}
        onConfirm={() => {
          if (pendingUnlink) unlinkMut.mutate(pendingUnlink.id);
        }}
      />
    </>
  );
}
