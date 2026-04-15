'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  RefreshCw,
  Percent,
  Link,
  Unlink,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { formatDate, formatCurrency, shortId } from '@/lib/utils';

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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: () => api.get<ReferralListResponse>(internalPaths.referrals),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { email: string; password: string; referralPercent: number; currency: string }) =>
      api.post(internalPaths.referrals, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
      setCreateOpen(false);
      setNewEmail('');
      setNewPassword('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, referralPercent }: { id: string; referralPercent: number }) =>
      api.patch(internalPaths.referral(id), { referralPercent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
      setDetailAgent(null);
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ agentId, userId }: { agentId: string; userId: string }) =>
      api.post(internalPaths.referralLinkUser(agentId), { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
      setLinkOpen(false);
      setLinkUserId('');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (userId: string) => api.delete(internalPaths.referralUnlinkUser(userId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
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
      render: (row: ReferralAgent) => (
        <span className="font-mono text-sm">{formatCurrency(row.balance, row.currency)}</span>
      ),
    },
    {
      key: 'referred',
      header: 'Referred',
      render: (row: ReferralAgent) => (
        <span className="text-sm text-text-secondary">{row.referrals.length} users</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
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
      render: (row: ReferralAgent) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLinkAgentId(row.id);
              setLinkOpen(true);
            }}
            title="Link a user"
          >
            <Link className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setDetailAgent(row); setEditPercent(String(row.referralPercent)); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
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
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Agent
          </Button>
        </div>
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
            <Input
              label="Commission % (0–100)"
              type="number"
              min={0}
              max={100}
              value={newPercent}
              onChange={(e) => setNewPercent(e.target.value)}
            />
            <Input
              label="Currency"
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
            Enter the UUID of the user (trader/merchant) to link to this referral agent.
          </p>
          <Input
            label="User UUID"
            value={linkUserId}
            onChange={(e) => setLinkUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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
                <Input
                  label="New Commission %"
                  type="number"
                  min={0}
                  max={100}
                  value={editPercent}
                  onChange={(e) => setEditPercent(e.target.value)}
                  className="flex-1"
                />
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unlinkMutation.mutate(u.id)}
                          loading={unlinkMutation.isPending}
                          title="Unlink"
                        >
                          <Unlink className="h-3.5 w-3.5 text-danger" />
                        </Button>
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
