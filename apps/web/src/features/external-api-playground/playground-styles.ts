import type { CSSProperties } from 'react';

/** Inline styles for External API playground — colors follow CSS variables on `.external-api-playground-root`. */
export const layout = {
  app: {
    height: '100%',
    width: '100%',
    maxWidth: '1480px',
    margin: '0 auto',
    padding: '0.65rem 1rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
    boxSizing: 'border-box',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    flexShrink: 0,
    marginBottom: '0.65rem',
  },
} as const;

export const keyGroupPayin: CSSProperties = {
  padding: '0.65rem 0.75rem',
  marginBottom: '0.85rem',
  borderRadius: '8px',
  border: '1px solid var(--pg-payin-border)',
  borderLeftWidth: '4px',
  borderLeftColor: 'var(--pg-payin-accent)',
  background: 'var(--pg-payin-bg)',
};

export const keyGroupPayout: CSSProperties = {
  padding: '0.65rem 0.75rem',
  marginBottom: '0.5rem',
  borderRadius: '8px',
  border: '1px solid var(--pg-payout-border)',
  borderLeftWidth: '4px',
  borderLeftColor: 'var(--pg-payout-accent)',
  background: 'var(--pg-payout-bg)',
};

export const keyGroupLabel: CSSProperties = {
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--pg-muted)',
  marginBottom: '0.5rem',
  fontWeight: 600,
};

export const sectionTitle: CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--pg-muted)',
  margin: '0 0 0.65rem',
};

export const label: CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'var(--pg-label)',
  marginBottom: '0.25rem',
};

export const input: CSSProperties = {
  width: '100%',
  marginBottom: '0.65rem',
  padding: '0.45rem 0.5rem',
  borderRadius: '6px',
  border: '1px solid var(--pg-input-border)',
  background: 'var(--pg-input-bg)',
  color: 'var(--pg-input-text)',
};

export const inputMono: CSSProperties = {
  ...input,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.75rem',
};

export const textarea: CSSProperties = {
  ...input,
  minHeight: '220px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.8rem',
  marginBottom: '0.75rem',
};

export const button: CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  border: 'none',
  background: '#3d5afe',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

export const pre: CSSProperties = {
  margin: 0,
  padding: '0.65rem',
  background: 'var(--pg-pre-bg)',
  borderRadius: '6px',
  border: '1px solid var(--pg-pre-border)',
  fontSize: '0.75rem',
  overflow: 'auto',
  maxHeight: 'min(70vh, 520px)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const block: CSSProperties = { marginBottom: '0.5rem' };

export const fileInput: CSSProperties = { marginBottom: '0.65rem', color: 'var(--pg-label)' };

export const help: CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--pg-muted)',
  margin: '0 0 0.65rem',
  lineHeight: 1.45,
};

export const helpAside: CSSProperties = {
  ...help,
  margin: '0 0 0.75rem',
  padding: '0.5rem 0.6rem',
  background: 'var(--pg-help-bg)',
  borderRadius: '6px',
  border: '1px solid var(--pg-help-border)',
};

export const btnRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

export const btnSecondary: CSSProperties = {
  ...button,
  background: 'var(--pg-btn-secondary)',
  fontWeight: 500,
  fontSize: '0.8rem',
  padding: '0.35rem 0.65rem',
};
