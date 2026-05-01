'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Percent,
  Link,
  Unlink,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { fetchCurrencyList } from '@/lib/currency-queries';
import { formatDate, formatCurrency, shortId } from '@/lib/utils';
import { mergeIntoDataTotalList } from '@/lib/query-cache-merge';

interface ReferralProfileApi {
  id: string;
  referralPercent: unknown;
  currency: string;
  createdAt: string;
  user: { id: string; email: string; isActive: boolean };
}

interface ReferralAgent {
  id: string;
  referralPercent: number;
  balance: number;
  currency: string;
  createdAt: string;
  user: { id: string; email: string; isActive: boolean };
  referrals: { id: string; email: string; role: string; isActive: boolean }[];
}

interface ReferralListResponse {
  data: ReferralAgent[];
  total: number;
}

interface LinkedUserPayload {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
}

function referralAgentFromCreatedProfile(profile: ReferralProfileApi): ReferralAgent {
  return {
    id: profile.id,
    referralPercent: Number(profile.referralPercent),
    balance: 0,
    currency: profile.currency,
    createdAt: profile.createdAt,
    user: profile.user,
    referrals: [],
  };
}

export default function ReferralsAdminPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAgent, setDetailAgent] = useState<ReferralAgent | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkAgentId, setLinkAgentId] = useState('');
  const [linkUserId, setLinkUserId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPercent, setNewPercent] = useState('5');
  const [newCurrency, setNewCurrency] = useState('UAH');
  const [editPercent, setEditPercent] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: () => api.get<ReferralListResponse>(internalPaths.referrals),
  });

  const { data: currencyRows = [] } = useQuery({
    queryKey: ['currencies'],
    queryFn: fetchCurrencyList,
  });

  const newAgentCurrencyOptions = useMemo(() => {
    const active = currencyRows
      .filter((c) => c.isActive)
      .map((c) => ({ value: c.code, label: c.code }));
    const v = newCurrency.trim().toUpperCase();
    if (v && !active.some((o) => o.value === v)) {
      active.push({ value: v, label: `${v} (inactive)` });
    }
    active.sort((a, b) => a.value.localeCompare(b.value));
    return active;
  }, [currencyRows, newCurrency]);

  const createMutation = useMutation({
    mutationFn: (payload: { email: string; password: string; referralPercent: number; currency: string }) =>
      api.post<ReferralProfileApi>(internalPaths.referrals, payload),
    onSuccess: (profile) => {
      mergeIntoDataTotalList(
        queryClient,
        ['admin', 'referrals'],
        referralAgentFromCreatedProfile(profile),
        { maxChunk: 20 },
      );
      setCreateOpen(false);
      setNewEmail('');
      setNewPassword('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, referralPercent }: { id: string; referralPercent: number }) =>
      api.patch<ReferralProfileApi>(internalPaths.referral(id), { referralPercent }),
    onSuccess: (profile) => {
      queryClient.setQueryData<ReferralListResponse>(['admin', 'referrals'], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((row) =>
            row.id === profile.id
              ? {
                  ...row,
                  referralPercent: Number(profile.referralPercent),
                  currency: profile.currency,
                }
              : row,
          ),
        };
      });
      setDetailAgent(null);
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ agentId, userId }: { agentId: string; userId: string }) =>
      api.post<LinkedUserPayload>(internalPaths.referralLinkUser(agentId), { userId }),
    onSuccess: (linkedUser, vars) => {
      queryClient.setQueryData<ReferralListResponse>(['admin', 'referrals'], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((agent) =>
            agent.id !== vars.agentId
              ? agent
              : {
                  ...agent,
                  referrals: [
                    ...agent.referrals.filter((u) => u.id !== linkedUser.id),
                    {
                      id: linkedUser.id,
                      email: linkedUser.email,
                      role: linkedUser.role,
                      isActive: linkedUser.isActive,
                    },
                  ],
                },
          ),
        };
      });
      setLinkOpen(false);
      setLinkUserId('');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (userId: string) => api.delete(internalPaths.referralUnlinkUser(userId)),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<ReferralListResponse>(['admin', 'referrals'], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((agent) => ({
            ...agent,
            referrals: agent.referrals.filter((u) => u.id !== userId),
          })),
        };
      });
    },
  });

  const columns = [
    {
      key: 'email',
      header: 'Agent',
      render: (row: ReferralAgent) => (
        <div>
          <p className="font-medium text-text-primary">{row.user.email}</p>
          <p className="text-xs font-mono text-text-muted">{shortId(row.id)}</p>
        </div>
      ),
    },
    {
      key: 'percent',
      header: 'Commission %',
      className: 'text-end tabular-nums',
      render: (row: ReferralAgent) => (
        <div className="flex items-center gap-1">
          <Percent className="h-3.5 w-3.5 text-accent-blue" />
          <span className="font-semibold text-accent-blue">{row.referralPercent}%</span>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      className: 'text-end tabular-nums font-mono',
      render: (row: ReferralAgent) => (
        <span className="font-mono text-sm">{formatCurrency(row.balance, row.currency)}</span>
      ),
    },
    {
      key: 'referred',
      header: 'Referred',
      className: 'text-end tabular-nums',
      render: (row: ReferralAgent) => (
        <span className="text-sm text-text-secondary">{row.referrals.length} users</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: ReferralAgent) => (
        <Badge variant={row.user.isActive ? 'success' : 'default'} dot>
          {row.user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row: ReferralAgent) => (
        <span className="text-xs text-text-muted">
          {formatDate(new Date(row.createdAt).getTime() / 1000)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      render: (row: ReferralAgent) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Link a user to this agent"
            onClick={() => {
              setLinkAgentId(row.id);
              setLinkOpen(true);
            }}
          >
            <Link className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label="View agent details"
            onClick={() => {
              setDetailAgent(row);
              setEditPercent(String(row.referralPercent));
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Referral Agents</h1>
            <p className="text-sm text-text-muted">{data?.total ?? 0} agents total</p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      <Table
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => { setDetailAgent(row); setEditPercent(String(row.referralPercent)); }}
        emptyMessage="No referral agents yet"
      />

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Referral Agent">
        <div className="space-y-4">
          <Input label="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Input label="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Commission (0–100)"
              variant="percent"
              suffix="%"
              min={0}
              max={100}
              value={newPercent}
              onChange={(e) => setNewPercent(e.target.value)}
            />
            <CurrencySelectWithCreate
              label="Currency"
              placeholder="Select currency"
              options={newAgentCurrencyOptions}
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate({
                email: newEmail,
                password: newPassword,
                referralPercent: parseFloat(newPercent) || 0,
                currency: newCurrency || 'UAH',
              })}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Link user modal */}
      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link User to Agent">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Enter the user ID for the trader or merchant to attach to this referral agent (copy from the
            user profile).
          </p>
          <Input
            label="User ID"
            value={linkUserId}
            onChange={(e) => setLinkUserId(e.target.value)}
            placeholder="User ID"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={linkMutation.isPending}
              onClick={() => linkMutation.mutate({ agentId: linkAgentId, userId: linkUserId })}
            >
              Link
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail / edit modal */}
      <Modal
        open={!!detailAgent}
        onClose={() => setDetailAgent(null)}
        title={`Agent — ${detailAgent?.user.email ?? ''}`}
        size="lg"
      >
        {detailAgent && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border border-border-primary bg-bg-secondary p-3">
                <p className="text-lg font-bold text-accent-blue">{detailAgent.referralPercent}%</p>
                <p className="text-xs text-text-muted">Commission</p>
              </div>
              <div className="rounded-lg border border-border-primary bg-bg-secondary p-3">
                <p className="text-lg font-bold text-accent-green">
                  {formatCurrency(detailAgent.balance, detailAgent.currency)}
                </p>
                <p className="text-xs text-text-muted">Balance</p>
              </div>
              <div className="rounded-lg border border-border-primary bg-bg-secondary p-3">
                <p className="text-lg font-bold text-text-primary">{detailAgent.referrals.length}</p>
                <p className="text-xs text-text-muted">Referred Users</p>
              </div>
            </div>

            <Card>
              <h3 className="mb-3 text-sm font-medium text-text-secondary">Update Commission %</h3>
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <NumberInput
                    label="New commission"
                    variant="percent"
                    suffix="%"
                    min={0}
                    max={100}
                    value={editPercent}
                    onChange={(e) => setEditPercent(e.target.value)}
                  />
                </div>
                <Button
                  variant="primary"
                  loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: detailAgent.id, referralPercent: parseFloat(editPercent) || 0 })}
                >
                  Save
                </Button>
              </div>
            </Card>

            {detailAgent.referrals.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium text-text-secondary">Referred Users</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {detailAgent.referrals.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border border-border-primary bg-bg-secondary px-3 py-2"
                    >
                      <div>
                        <p className="text-sm text-text-primary">{u.email}</p>
                        <p className="text-xs text-text-muted">{u.role}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={u.isActive ? 'success' : 'default'} dot>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <IconButton
                          label="Unlink user from this agent"
                          variant="ghost"
                          onClick={() => unlinkMutation.mutate(u.id)}
                          loading={unlinkMutation.isPending}
                        >
                          <Unlink className="h-3.5 w-3.5 text-danger" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
