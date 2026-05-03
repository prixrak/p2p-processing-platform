/**
 * Subtle single borders for panels and stat cards (no stacked ring glow).
 */
export type SurfaceRingTone =
  | 'neutral'
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'amber'
  | 'rose';

export function surfaceRingClass(tone: SurfaceRingTone = 'neutral'): string {
  switch (tone) {
    case 'blue':
      return 'border border-accent-blue/22 bg-accent-blue/[0.05]';
    case 'green':
      return 'border border-accent-green/22 bg-accent-green/[0.05]';
    case 'purple':
      return 'border border-accent-purple/22 bg-accent-purple/[0.05]';
    case 'orange':
      return 'border border-accent-orange/22 bg-accent-orange/[0.05]';
    case 'amber':
      return 'border border-amber-500/28 bg-amber-500/[0.06]';
    case 'rose':
      return 'border border-rose-500/26 bg-rose-500/[0.05]';
    default:
      return 'border border-border-primary bg-surface-secondary';
  }
}

export const STAT_CARD_TONE_SEQUENCE: SurfaceRingTone[] = [
  'blue',
  'green',
  'purple',
  'orange',
  'amber',
  'rose',
  'neutral',
];

export function statCardToneAt(index: number): SurfaceRingTone {
  return STAT_CARD_TONE_SEQUENCE[index % STAT_CARD_TONE_SEQUENCE.length]!;
}

/** Gradient wallet tiles (index into this array). */
export const WALLET_HIGHLIGHT_PRESETS = [
  {
    gradient: 'bg-gradient-to-br from-sky-500 via-blue-600 to-blue-950',
  },
  {
    gradient: 'bg-gradient-to-br from-violet-500 via-indigo-600 to-slate-950',
  },
  {
    gradient: 'bg-gradient-to-br from-emerald-500 via-teal-600 to-slate-950',
  },
  {
    gradient: 'bg-gradient-to-br from-amber-500 via-orange-600 to-stone-950',
  },
] as const;

/** Icon tile inside accent stat cards */
export function surfaceIconWrapClass(tone: SurfaceRingTone = 'neutral'): string {
  switch (tone) {
    case 'blue':
      return 'bg-accent-blue/15 text-accent-blue';
    case 'green':
      return 'bg-accent-green/15 text-accent-green';
    case 'purple':
      return 'bg-accent-purple/15 text-accent-purple';
    case 'orange':
      return 'bg-accent-orange/15 text-accent-orange';
    case 'amber':
      return 'bg-amber-500/15 text-amber-400';
    case 'rose':
      return 'bg-rose-500/15 text-rose-400';
    default:
      return 'bg-accent-muted text-accent';
  }
}
