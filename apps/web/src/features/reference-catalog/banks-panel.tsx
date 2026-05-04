'use client';

import { useState, useRef, useMemo } from 'react';
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
import { SearchStatusRow } from '@/components/ui/list-page-tools';
import { upsertSortedArrayCache } from '@/lib/query-cache-merge';
import { ownerReferenceKeys } from '@/lib/query-keys';
import { CATALOG_STATUS_FILTER_OPTIONS } from './catalog-filter-options';

interface Bank {
  id: string;
  name: string;
  logoUrl: string | null;
  status: string;
}

/** Admin API returns Prisma rows with `isActive`, not `status`. */
interface BankApiRow {
  id: number;
  name: string;
  logoFileId?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
}

function bankApiToBank(row: BankApiRow, fallback?: Pick<Bank, 'logoUrl'>): Bank {
  return {
    id: String(row.id),
    name: row.name,
    logoUrl: row.logoUrl ?? fallback?.logoUrl ?? null,
    status: row.isActive ? 'active' : 'inactive',
  };
}

export function BanksPanel() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Bank | null>(null);
  const [form, setForm] = useState({ name: '' });
  const [logo, setLogo] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ownerReferenceKeys.banks,
    queryFn: async () => {
      const rows = await api.get<BankApiRow[]>(internalPaths.banksAdmin);
      return rows.map((row) => bankApiToBank(row));
    },
  });

  const rows = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (q && !b.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const createBank = useMutation({
    mutationFn: async () => {
      let logoFileId: string | undefined;
      if (logo) {
        const fd = new FormData();
        fd.append('file', logo);
        const uploaded = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
        logoFileId = uploaded.id;
      }
      return api.post<BankApiRow>(internalPaths.banks, {
        name: form.name.trim(),
        ...(logoFileId ? { logoFileId } : {}),
      });
    },
    onSuccess: (row) => {
      upsertSortedArrayCache(queryClient, ownerReferenceKeys.banks, bankApiToBank(row), {
        idOf: (b: Bank) => b.id,
        sort: (a: Bank, b: Bank) => a.name.localeCompare(b.name),
      });
      closeCreate();
    },
  });

  const updateBank = useMutation({
    mutationFn: async (): Promise<BankApiRow> => {
      if (!editItem) {
        throw new Error('No bank selected');
      }
      let logoFileId: string | undefined;
      if (logo) {
        const fd = new FormData();
        fd.append('file', logo);
        const uploaded = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
        logoFileId = uploaded.id;
      }
      return api.put<BankApiRow>(internalPaths.bank(editItem.id), {
        name: form.name.trim(),
        ...(logoFileId ? { logoFileId } : {}),
      });
    },
    onSuccess: (row) => {
      const prev = queryClient.getQueryData<Bank[]>(ownerReferenceKeys.banks) ?? [];
      const existing = prev.find((b) => b.id === String(row.id));
      upsertSortedArrayCache(queryClient, ownerReferenceKeys.banks, bankApiToBank(row, existing ?? undefined), {
        idOf: (b: Bank) => b.id,
        sort: (a: Bank, b: Bank) => a.name.localeCompare(b.name),
      });
      setEditItem(null);
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      status === 'active'
        ? api.patch<BankApiRow>(internalPaths.bankDeactivate(id))
        : api.patch<BankApiRow>(internalPaths.bankActivate(id)),
    onSuccess: (row) => {
      const prev = queryClient.getQueryData<Bank[]>(ownerReferenceKeys.banks) ?? [];
      const existing = prev.find((b) => b.id === String(row.id));
      upsertSortedArrayCache(queryClient, ownerReferenceKeys.banks, bankApiToBank(row, existing ?? undefined), {
        idOf: (b: Bank) => b.id,
        sort: (a: Bank, b: Bank) => a.name.localeCompare(b.name),
      });
    },
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
      className: 'w-16 text-center',
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
      className: 'text-center',
      render: (b: Bank) => (
        <Badge color={b.status === 'active' ? 'green' : 'red'}>{b.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (b: Bank) => (
        <div className="flex items-center gap-2">
          <IconButton label="Edit bank" onClick={() => openEdit(b)}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={b.status === 'active' ? 'Deactivate bank' : 'Activate bank'}
            variant={b.status === 'active' ? 'danger' : 'success'}
            onClick={() => toggleStatus.mutate({ id: b.id, status: b.status })}
          >
            {b.status === 'active' ? (
              <PowerOff className="h-4 w-4" />
            ) : (
              <Power className="h-4 w-4" />
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Banks</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Manage bank directory. Use deactivate instead of deleting banks that appear on historical
          orders; merchants only see active banks (for example via Pay-In bank lists).
        </p>
      </div>

      <SearchStatusRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Bank name..."
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={CATALOG_STATUS_FILTER_OPTIONS}
        trailing={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add Bank
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
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
