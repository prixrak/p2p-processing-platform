'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  totalPages: number;
}

const roleColors: Record<string, 'blue' | 'green' | 'yellow' | 'red' | 'default'> = {
  owner: 'red',
  admin: 'yellow',
  trader: 'green',
  merchant: 'blue',
  support: 'default',
};

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'trader', label: 'Trader' },
  { value: 'merchant', label: 'Merchant' },
  { value: 'support', label: 'Support' },
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'trader', name: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'users', page],
    queryFn: () => api.get<UsersResponse>(`/api/admin/users?page=${page}&limit=20`),
  });

  const createUser = useMutation({
    mutationFn: (payload: typeof form) => api.post('/api/admin/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'users'] });
      setShowCreate(false);
      setForm({ email: '', password: '', role: 'trader', name: '' });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/admin/users/${id}`, { status: status === 'active' ? 'inactive' : 'active' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'users'] }),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/api/admin/users/${id}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'users'] }),
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u: User) => (
        <div>
          <p className="font-medium text-text-primary">{u.name || '—'}</p>
          <p className="text-xs text-text-muted">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: User) => (
        <Badge color={roleColors[u.role] ?? 'default'}>
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: User) => (
        <Badge color={u.status === 'active' ? 'green' : 'red'}>
          {u.status}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (u: User) => (
        <span className="text-sm text-text-secondary">
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u: User) => (
        <div className="flex items-center gap-2">
          <Select
            options={roleOptions}
            value={u.role}
            onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value })}
            className="!py-1.5 !text-xs w-28"
          />
          <Button
            variant={u.status === 'active' ? 'danger' : 'success'}
            size="sm"
            onClick={() => toggleStatus.mutate({ id: u.id, status: u.status })}
          >
            {u.status === 'active' ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Users</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage platform users and their roles
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Create User
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No users found"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create User">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate(form);
          }}
        >
          <Input
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="John Doe"
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="user@example.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            required
          />
          <Select
            label="Role"
            options={roleOptions}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createUser.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
