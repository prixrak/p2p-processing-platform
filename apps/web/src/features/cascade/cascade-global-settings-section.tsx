'use client';

import { useMemo, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  NEWCOMER_RATING_BOOST,
} from '@p2p/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import {
  buildCanonicalFillLadderJson,
  FILL_LADDER_THRESHOLD_PCT_MAX,
  FILL_LADDER_THRESHOLD_PCT_MIN,
  interpretFillMultipliersDraftString,
  ladderFromDefaults,
} from './fill-ladder-ui';
import type { CascadeSettings } from './cascade-types';

const levelPickOptions: SelectOption[] = [
  { value: 'DEBT', label: 'DEBT (deterministic credits)' },
  { value: 'STOCHASTIC', label: 'STOCHASTIC (weighted random)' },
];

function trafficSumHintPct(fork: number, card: number): string | null {
  if (!(Number.isFinite(fork) && Number.isFinite(card))) return null;
  const sum = fork + card;
  if (Math.abs(sum - 100) <= 1) return null;
  return `Fork and Card should total ~100% for the documented tier-1 split (currently ${sum.toFixed(sum % 1 === 0 ? 0 : 1)}%).`;
}

/** Small tag chip used for method tier labels (Fork / Card / Provider). */
function MethodChip({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

export function CascadeGlobalSettingsSection({
  readOnly,
  settings,
  isLoading,
  draftThreshold,
  setDraftThreshold,
  draftAutolimits,
  setDraftAutolimits,
  draftForkPct,
  setDraftForkPct,
  draftCardPct,
  setDraftCardPct,
  draftProviderPct,
  setDraftProviderPct,
  draftLevelPickMode,
  setDraftLevelPickMode,
  draftFillMultipliersJson,
  setDraftFillMultipliersJson,
  fillMultipliersJsonError,
  onSave,
  savePending,
}: {
  readOnly: boolean;
  settings: CascadeSettings | undefined;
  isLoading: boolean;
  draftThreshold: string;
  setDraftThreshold: (v: string) => void;
  draftAutolimits: boolean;
  setDraftAutolimits: (v: boolean) => void;
  draftForkPct: string;
  setDraftForkPct: (v: string) => void;
  draftCardPct: string;
  setDraftCardPct: (v: string) => void;
  draftProviderPct: string;
  setDraftProviderPct: (v: string) => void;
  draftLevelPickMode: string;
  setDraftLevelPickMode: (v: string) => void;
  draftFillMultipliersJson: string;
  setDraftFillMultipliersJson: (v: string) => void;
  fillMultipliersJsonError: string | null;
  onSave: () => void;
  savePending: boolean;
}) {
  const s = settings;

  const forkNum = Number(draftForkPct);
  const cardNum = Number(draftCardPct);

  const trafficHint = trafficSumHintPct(forkNum, cardNum);

  const ladderInfo = useMemo(
    () => interpretFillMultipliersDraftString(draftFillMultipliersJson.trim()),
    [draftFillMultipliersJson],
  );

  const ladderUiSnapshot =
    ladderInfo.mode === 'canonical' || ladderInfo.mode === 'empty'
      ? ladderInfo.canonical
      : null;

  const pctLabel =
    ladderUiSnapshot != null
      ? Math.round(
          Math.min(
            FILL_LADDER_THRESHOLD_PCT_MAX,
            Math.max(FILL_LADDER_THRESHOLD_PCT_MIN, ladderUiSnapshot.thresholdPct),
          ),
        )
      : null;

  const applyCanonicalLadder = (next: {
    thresholdPct: number;
    multipliers: [number, number, number, number];
  }) => {
    setDraftFillMultipliersJson(
      buildCanonicalFillLadderJson(next.thresholdPct, next.multipliers),
    );
  };

  return (
    <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
      <h2 className="text-sm font-medium text-text-secondary">Cascade settings</h2>
      {isLoading ? (
        <Loader2 className="mt-4 h-6 w-6 animate-spin text-text-muted" />
      ) : s ? (
        readOnly ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Pay-in provider integration</dt>
              <dd className="font-medium">
                {s.payin_provider_integration_enabled ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
            <div className="sm:col-span-2 space-y-2 rounded-xl border border-border-primary bg-surface-primary/30 p-4">
              <p className="text-xs font-medium text-text-primary">Traffic between methods</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-text-muted">Fork % (tier 1)</dt>
                  <dd className="font-medium tabular-nums">{s.fork_traffic_percent}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Card % (tier 2)</dt>
                  <dd className="font-medium tabular-nums">{s.card_traffic_percent}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Provider % (ledger)</dt>
                  <dd className="font-medium tabular-nums">{s.provider_traffic_percent}</dd>
                </div>
              </div>
            </div>
            <div>
              <dt className="text-text-muted">Primary tier mode</dt>
              <dd className="font-medium">{s.level_pick_mode}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Fork autolimit threshold</dt>
              <dd className="font-medium">{s.autolimit_threshold}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Autolimits enabled</dt>
              <dd className="font-medium">{s.autolimit_enabled ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Newcomer boost (Fork fill floor)</dt>
              <dd className="font-medium">×{NEWCOMER_RATING_BOOST}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Fork fill multiplier ladder</dt>
              <dd className="font-medium">
                {s.fill_multipliers_config == null ? 'Platform default' : 'Custom'}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-4 space-y-8">
            <div className="rounded-xl border border-border-primary bg-surface-primary/40 p-4 text-sm text-text-secondary">
              <p className="font-medium text-text-primary">How routing works</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  Pay-In chooses only <strong className="font-medium">Fork</strong> or{' '}
                  <strong className="font-medium">Card</strong> using the percentages below (~100%).
                  Provider is never the first stop.
                </li>
                <li>
                  Within a tier the requisite with the highest idle race score wins; if empty, cascade
                  tries the other trader tier, then the external provider.
                </li>
                <li>
                  Fork idle score{' '}
                  <code className="text-xs">idle × max(fill_mult, trader_mult)</code> with a confirmed
                  fill ladder and newcomer floor until the first assignment. Card uses{' '}
                  <code className="text-xs">idle × trader_mult</code> only.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Traffic between methods
                </h3>
                {trafficHint ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{trafficHint}</p>
                ) : null}
              </div>

              <div className="space-y-3">
                <article className="flex flex-wrap items-start gap-4 rounded-xl border border-border-primary bg-surface-primary p-4 shadow-sm">
                  <MethodChip className="border border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100">
                    Fork
                  </MethodChip>
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <h4 className="text-sm font-semibold text-text-primary">
                      Level 1 — priority
                    </h4>
                    <Input
                      label="% traffic to Fork"
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={draftForkPct}
                      onChange={(e) => setDraftForkPct(e.target.value)}
                    />
                    <p className="text-xs text-text-muted">
                      Requisite race:{' '}
                      <code className="text-[11px]">idle × max(fill_mult, trader_mult)</code>
                    </p>
                  </div>
                </article>

                <article className="flex flex-wrap items-start gap-4 rounded-xl border border-border-primary bg-surface-primary p-4 shadow-sm">
                  <MethodChip className="border border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                    Card
                  </MethodChip>
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <h4 className="text-sm font-semibold text-text-primary">
                      Level 2 — reserved tier
                    </h4>
                    <Input
                      label="% traffic to Card"
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={draftCardPct}
                      onChange={(e) => setDraftCardPct(e.target.value)}
                    />
                    <p className="text-xs text-text-muted">
                      Selection{' '}
                      <code className="text-[11px]">idle × trader_mult</code> — no{' '}
                      <code className="text-[11px]">fill_mult</code>
                    </p>
                  </div>
                </article>

                <div className="grid gap-4 sm:max-w-md">
                  <Input
                    label="Provider traffic % (ledger only)"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={draftProviderPct}
                    onChange={(e) => setDraftProviderPct(e.target.value)}
                    disabled={!s.payin_provider_integration_enabled}
                  />
                </div>
              </div>
            </div>

            {!s.payin_provider_integration_enabled ? (
              <p className="text-xs text-text-muted">
                Provider share is read-only until pay-in provider integration is enabled in platform
                settings.
              </p>
            ) : null}

            <div className="space-y-4 rounded-xl border border-border-primary bg-surface-primary/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Fork ranking (confirmed fill ladder)
              </h3>
              <p className="text-xs text-text-muted">
                Multipliers apply to confirmed Pay-In volume vs requisite limit (±1% bands). New
                requisites without assignments use at least{' '}
                <span className="font-medium text-text-secondary">×{NEWCOMER_RATING_BOOST}</span>{' '}
                on the fill leg (platform constant).
              </p>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr] lg:items-end">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-text-secondary">
                    Newcomer boost (read-only)
                  </label>
                  <div className="flex h-10 items-center rounded-lg border border-border-primary bg-surface-primary/60 px-3 text-sm tabular-nums text-text-primary">
                    ×{NEWCOMER_RATING_BOOST.toFixed(1)}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="cascade-fill-threshold"
                      className="text-sm font-medium text-text-secondary"
                    >
                      First acceleration threshold
                    </label>
                    <span className="text-sm tabular-nums text-text-primary">
                      {pctLabel != null ? `${pctLabel}%` : 'Custom'}
                    </span>
                  </div>
                  <input
                    id="cascade-fill-threshold"
                    type="range"
                    className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                    min={FILL_LADDER_THRESHOLD_PCT_MIN}
                    max={FILL_LADDER_THRESHOLD_PCT_MAX}
                    step={1}
                    value={
                      ladderUiSnapshot != null
                        ? Math.min(
                            FILL_LADDER_THRESHOLD_PCT_MAX,
                            Math.max(
                              FILL_LADDER_THRESHOLD_PCT_MIN,
                              ladderUiSnapshot.thresholdPct,
                            ),
                          )
                        : FILL_LADDER_THRESHOLD_PCT_MIN
                    }
                    disabled={ladderUiSnapshot == null || ladderInfo.mode === 'invalid_json'}
                    onChange={(e) => {
                      if (!ladderUiSnapshot) return;
                      const v = Number(e.target.value);
                      applyCanonicalLadder({
                        thresholdPct: v,
                        multipliers: ladderUiSnapshot.multipliers,
                      });
                    }}
                  />
                  <p className="text-xs text-text-muted">
                    Confirmed fill below this share keeps the base multiplier; each next 10% band uses
                    the values below.
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-text-secondary">
                  Band multipliers (next 10% steps / terminal band)
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['Tier 2 (first step)', 0],
                    ['Tier 3', 1],
                    ['Tier 4', 2],
                    ['Top band → 100%', 3],
                  ] as const).map(([label, idx]) => (
                    <Input
                      key={label}
                      label={label}
                      type="number"
                      min={1}
                      max={10}
                      step="any"
                      value={
                        ladderUiSnapshot != null
                          ? String(ladderUiSnapshot.multipliers[idx])
                          : ''
                      }
                      placeholder={ladderUiSnapshot == null ? '—' : undefined}
                      disabled={ladderUiSnapshot == null}
                      onChange={(e) => {
                        if (!ladderUiSnapshot) return;
                        const n = Number(e.target.value);
                        if (!(n > 0)) return;
                        const nextMults = [...ladderUiSnapshot.multipliers] as [
                          number,
                          number,
                          number,
                          number,
                        ];
                        nextMults[idx] = n;
                        applyCanonicalLadder({
                          thresholdPct: ladderUiSnapshot.thresholdPct,
                          multipliers: nextMults,
                        });
                      }}
                    />
                  ))}
                </div>
              </div>

              {ladderInfo.mode === 'custom_tiers' || ladderInfo.mode === 'invalid_json' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  {ladderInfo.mode === 'invalid_json' ? (
                    <span>
                      Stored ladder payload is invalid.{' '}
                      <button
                        type="button"
                        className="font-semibold underline decoration-amber-800/50 hover:decoration-amber-950 dark:decoration-amber-200"
                        onClick={() => {
                          const d = ladderFromDefaults();
                          applyCanonicalLadder(d);
                        }}
                      >
                        Reset to preset layout
                      </button>{' '}
                      to restore the default editable ladder.
                    </span>
                  ) : (
                    <span>
                      This ladder uses custom breakpoints — slider and multiplier shortcuts are disabled.{' '}
                      <button
                        type="button"
                        className="font-semibold underline decoration-amber-800/50 hover:decoration-amber-950 dark:decoration-amber-200"
                        onClick={() => {
                          const d = ladderFromDefaults();
                          applyCanonicalLadder(d);
                        }}
                      >
                        Reset to preset layout
                      </button>
                      .
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            <Select
              label="Primary tier selection"
              options={levelPickOptions}
              value={draftLevelPickMode}
              onChange={(e) => setDraftLevelPickMode(e.target.value)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Fork autolimit threshold (0–1)"
                type="text"
                inputMode="decimal"
                value={draftThreshold}
                onChange={(e) => setDraftThreshold(e.target.value)}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent-blue"
                checked={draftAutolimits}
                onChange={(e) => setDraftAutolimits(e.target.checked)}
              />
              Fork autolimits enabled
            </label>

            {fillMultipliersJsonError ? (
              <p className="text-sm text-danger">{fillMultipliersJsonError}</p>
            ) : null}

            <Button type="button" size="sm" loading={savePending} onClick={onSave}>
              Save settings
            </Button>
          </div>
        )
      ) : (
        <p className="mt-2 text-sm text-danger">Failed to load settings.</p>
      )}
    </section>
  );
}
