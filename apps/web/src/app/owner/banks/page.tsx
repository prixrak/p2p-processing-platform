'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Power, PowerOff, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';

interface Bank {
  id: string;
  name: string;
  logoUrl: string | null;
  status: string;
}

export default function BanksPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Bank | null>(null);
  const [form, setForm] = useState({ name: '' });
  const [logo, setLogo] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'banks'],
    queryFn: () => api.get<Bank[]>(internalPaths.banksAdmin),
  });

  const createBank = useMutation({
    mutationFn: async () => {
      let logoFileId: string | undefined;
      if (logo) {
        const fd = new FormData();
        fd.append('file', logo);
        const uploaded = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
        logoFileId = uploaded.id;
      }
      return api.post(internalPaths.banks, {
        name: form.name.trim(),
        ...(logoFileId ? { logoFileId } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'banks'] });
      closeCreate();
    },
  });

  const updateBank = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      let logoFileId: string | undefined;
      if (logo) {
        const fd = new FormData();
        fd.append('file', logo);
        const uploaded = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
        logoFileId = uploaded.id;
      }
      return api.put(internalPaths.bank(editItem.id), {
        name: form.name.trim(),
        ...(logoFileId ? { logoFileId } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'banks'] });
      setEditItem(null);
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      status === 'active'
        ? api.patch(internalPaths.bankDeactivate(id))
        : api.patch(internalPaths.bankActivate(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'banks'] }),
  });

  const closeCreate = () => {
    setShowCreate(false);
    setForm({ name: '' });
    setLogo(null);
  };

  const openEdit = (b: Bank) => {
    setEditItem(b);
    setForm({ name: b.name });
    setLogo(null);
  };

  const columns = [
    {
      key: 'logo',
      header: 'Logo',
      className: 'w-16',
      render: (b: Bank) =>
        b.logoUrl ? (
          <img
            src={b.logoUrl}
            alt={b.name}
            className="h-8 w-8 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-xs font-medium text-text-muted">
            {b.name.charAt(0)}
          </div>
        ),
    },
    {
      key: 'name',
      header: 'Bank Name',
      render: (b: Bank) => (
        <span className="font-medium text-text-primary">{b.name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b: Bank) => (
        <Badge color={b.status === 'active' ? 'green' : 'red'}>{b.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (b: Bank) => (
        <div className="flex items-center gap-2">
          <IconButton label="Edit bank" onClick={() => openEdit(b)}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label={b.status === 'active' ? 'Deactivate bank' : 'Activate bank'}
            variant={b.status === 'active' ? 'danger' : 'success'}
            onClick={() => toggleStatus.mutate({ id: b.id, status: b.status })}
          >
            {b.status === 'active' ? (
              <PowerOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </div>
      ),
    },
  ];

  const logoField = (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-secondary">Logo</label>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-dashed border-border-secondary bg-surface-primary px-4 py-3 text-sm text-text-muted transition-colors hover:border-accent hover:text-text-secondary"
      >
        <Upload className="h-4 w-4" />
        {logo ? logo.name : 'Upload logo image'}
      </button>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Banks</h1>
          <p className="mt-1 text-sm text-text-muted">Manage bank directory</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add Bank
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        emptyMessage="No banks added"
      />

      <Modal open={showCreate} onClose={closeCreate} title="Add Bank">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createBank.mutate();
          }}
        >
          <Input
            label="Bank Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Sberbank"
            required
          />
          {logoField}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" loading={createBank.isPending}>
              Add
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={`Edit — ${editItem?.name ?? ''}`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateBank.mutate();
          }}
        >
          <Input
            label="Bank Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          {logoField}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateBank.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
