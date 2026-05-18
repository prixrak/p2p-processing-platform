'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, PowerOff, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { upsertSortedArrayCache } from '@/lib/query-cache-merge';
import { CountrySelectWithCreate } from '@/features/countries/country-select-with-create';
import {
  countryKeys,
  fetchCountryList,
  ownerReferenceKeys,
  type CountryListItem,
} from '@/lib/query-keys';
import { currencyCodeFromRelation } from '@/lib/country-queries';

/** Country embed from payment-method APIs: `currency` may be a Prisma `{ select: { code } }` relation. */
type PaymentMethodCountry = Omit<CountryListItem, 'currency'> & {
  currency: CountryListItem['currency'] | { code: string };
};

interface PaymentMethod {
  id: string;
  name: string;
  displayName: string;
  flowType: string;
  requisiteType: string;
  availability: string;
  isActive: boolean;
  country: PaymentMethodCountry;
}

const FLOW_LABELS: Record<string, string> = { P2P: 'P2P', P2C: 'P2C', CRYPTO: 'Crypto' };
const AVAIL_LABELS: Record<string, string> = { PAYIN: 'Pay-In', PAYOUT: 'Pay-Out', BOTH: 'Both' };
const AVAIL_COLOR: Record<string, 'green' | 'blue' | 'yellow'> = { PAYIN: 'blue', PAYOUT: 'yellow', BOTH: 'green' };

export default function PaymentMethodsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    countryId: '',
    name: '',
    displayName: '',
    flowType: 'P2P',
    requisiteType: 'CARD',
    availability: 'BOTH',
  });

  const { data: methods, isLoading } = useQuery({
    queryKey: ownerReferenceKeys.paymentMethods,
    queryFn: () => api.get<PaymentMethod[]>(internalPaths.paymentMethods),
  });

  const { data: countries } = useQuery({
    queryKey: countryKeys.ownerList,
    queryFn: () => fetchCountryList(),
    enabled: showCreate,
  });

  const create = useMutation({
    mutationFn: (body: typeof form) =>
      api.post<PaymentMethod>(internalPaths.adminPaymentMethods, body),
    onSuccess: (row) => {
      qc.setQueryData<Array<PaymentMethodCountry>>(countryKeys.ownerList, (countryRows) =>
        countryRows?.map((c) =>
          c.id === row.country.id
            ? {
                ...c,
                _count: {
                  paymentMethods: (c._count?.paymentMethods ?? 0) + 1,
                },
              }
            : c,
        ),
      );
      upsertSortedArrayCache(qc, ownerReferenceKeys.paymentMethods, row, {
        idOf: (m) => m.id,
        sort: (a, b) =>
          a.country.code.localeCompare(b.country.code) || a.name.localeCompare(b.name),
      });
      setShowCreate(false);
      setForm({
        countryId: '',
        name: '',
        displayName: '',
        flowType: 'P2P',
        requisiteType: 'CARD',
        availability: 'BOTH',
      });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<PaymentMethod>(internalPaths.adminPaymentMethod(id), { isActive: !isActive }),
    onSuccess: (row) =>
      upsertSortedArrayCache(qc, ownerReferenceKeys.paymentMethods, row, {
        idOf: (m) => m.id,
        sort: (a, b) =>
          a.country.code.localeCompare(b.country.code) || a.name.localeCompare(b.name),
      }),
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (m: PaymentMethod) => (
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-text-muted" />
          <div>
            <p className="font-mono text-sm font-semibold text-text-primary">{m.name}</p>
            <p className="text-xs text-text-muted">{m.displayName}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      className: 'font-mono text-center',
      render: (m: PaymentMethod) => (
        <span className="font-mono text-sm">
          {m.country.code} / {currencyCodeFromRelation(m.country.currency)}
        </span>
      ),
    },
    {
      key: 'flowType',
      header: 'Flow',
      className: 'text-center',
      render: (m: PaymentMethod) => (
        <Badge color="blue">{FLOW_LABELS[m.flowType] ?? m.flowType}</Badge>
      ),
    },
    {
      key: 'requisiteType',
      header: 'Requisite',
      render: (m: PaymentMethod) => (
        <span className="text-sm text-text-secondary">{m.requisiteType}</span>
      ),
    },
    {
      key: 'availability',
      header: 'Availability',
      className: 'text-center',
      render: (m: PaymentMethod) => (
        <Badge color={AVAIL_COLOR[m.availability] ?? 'blue'}>
          {AVAIL_LABELS[m.availability] ?? m.availability}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (m: PaymentMethod) => (
        <Badge color={m.isActive ? 'green' : 'red'}>{m.isActive ? 'active' : 'inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-center',
      render: (m: PaymentMethod) => (
        <IconButton
          label={m.isActive ? 'Deactivate payment method' : 'Activate payment method'}
          variant={m.isActive ? 'danger' : 'success'}
          onClick={() => toggle.mutate({ id: m.id, isActive: m.isActive })}
        >
          {m.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payment methods</h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure available methods per country (CARD_P2P, IBAN_P2P, CRYPTO…)
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add method
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={methods ?? []}
        isLoading={isLoading}
        emptyMessage="No payment methods configured"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New payment method">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form);
          }}
        >
          <CountrySelectWithCreate
            label="Country"
            placeholder="Select country…"
            required
            options={(countries ?? []).map((c) => ({
              value: c.id,
              label: `${c.name} (${c.currency})`,
            }))}
            value={form.countryId}
            onChange={(e) => setForm({ ...form, countryId: e.target.value })}
          />
          <Input
            label="System name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
            placeholder="CARD_P2P"
            required
          />
          <Input
            label="Display name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="P2P card"
            required
          />
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Flow"
              options={['P2P', 'P2C', 'CRYPTO'].map((v) => ({
                value: v,
                label: FLOW_LABELS[v] ?? v,
              }))}
              value={form.flowType}
              onChange={(e) => setForm({ ...form, flowType: e.target.value })}
            />
            <Select
              label="Requisite"
              options={['CARD', 'IBAN', 'WALLET'].map((v) => ({ value: v, label: v }))}
              value={form.requisiteType}
              onChange={(e) => setForm({ ...form, requisiteType: e.target.value })}
            />
            <Select
              label="Availability"
              options={['PAYIN', 'PAYOUT', 'BOTH'].map((v) => ({
                value: v,
                label: AVAIL_LABELS[v],
              }))}
              value={form.availability}
              onChange={(e) => setForm({ ...form, availability: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
