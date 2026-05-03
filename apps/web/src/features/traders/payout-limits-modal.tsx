'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { parseDecimalInput } from '@/lib/decimal-input';
import {
  staffKeys,
  staffTraderKeys,
  type StaffRolePrefix,
} from '@/lib/query-keys';
import type { StaffTraderRow } from './staff-trader-types';

export interface PayoutLimitsTrader {
  id: string;
  name: string;
  payoutMinLimit: number;
  payoutMaxLimit: number;
}

export function PayoutLimitsModal({
  trader,
  onClose,
  queryPrefix,
}: {
  trader: PayoutLimitsTrader | null;
  onClose: () => void;
  queryPrefix: StaffRolePrefix;
}) {
  const queryClient = useQueryClient();
  const [minLimit, setMinLimit] = useState('');
  const [maxLimit, setMaxLimit] = useState('');

  useEffect(() => {
    if (trader) {
      setMinLimit(String(trader.payoutMinLimit ?? 0));
      setMaxLimit(String(trader.payoutMaxLimit ?? 0));
    }
  }, [trader]);

  const setLimitsMutation = useMutation({
    mutationFn: ({ id, min, max }: { id: string; min: number; max: number }) =>
      api.post(internalPaths.traderPayoutLimits(id), { minLimit: min, maxLimit: max }),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<StaffTraderRow[]>(
        staffTraderKeys.list(queryPrefix),
        (old) =>
          old?.map((row) =>
            row.id !== vars.id
              ? row
              : {
                  ...row,
                  payoutMinLimit: vars.min,
                  payoutMaxLimit: vars.max,
                },
          ),
      );
      void queryClient.invalidateQueries({ queryKey: staffKeys.usersDirectory(queryPrefix) });
      onClose();
    },
  });

  return (
    <Modal
      open={!!trader}
      onClose={onClose}
      title={`Payout Limits — ${trader?.name ?? ''}`}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Set the min and max order amounts this trader can see in the pay-out pool.
          Set both to <strong>0</strong> to show all orders (no limit).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Min Amount (0 = no min)"
            variant="amount"
            min={0}
            value={minLimit}
            onChange={(e) => setMinLimit(e.target.value)}
            placeholder="0"
          />
          <NumberInput
            label="Max Amount (0 = no max)"
            variant="amount"
            min={0}
            value={maxLimit}
            onChange={(e) => setMaxLimit(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={setLimitsMutation.isPending}
            onClick={() =>
              trader &&
              setLimitsMutation.mutate({
                id: trader.id,
                min: parseDecimalInput(minLimit) || 0,
                max: parseDecimalInput(maxLimit) || 0,
              })
            }
          >
            Save Limits
          </Button>
        </div>
      </div>
    </Modal>
  );
}
