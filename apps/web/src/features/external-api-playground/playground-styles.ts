import type { CSSProperties } from 'react';

/** Inline styles for External API playground (dark panel UI). */
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
  border: '1px solid #2d3f6e',
  borderLeftWidth: '4px',
  borderLeftColor: '#5c7cfa',
  background: '#151a24',
};

export const keyGroupPayout: CSSProperties = {
  padding: '0.65rem 0.75rem',
  marginBottom: '0.5rem',
  borderRadius: '8px',
  border: '1px solid #5c4a2a',
  borderLeftWidth: '4px',
  borderLeftColor: '#d4a24c',
  background: '#181612',
};

export const keyGroupLabel: CSSProperties = {
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8b909d',
  marginBottom: '0.5rem',
  fontWeight: 600,
};

export const sectionTitle: CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#8b909d',
  margin: '0 0 0.65rem',
};

export const label: CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#b4bac8',
  marginBottom: '0.25rem',
};

export const input: CSSProperties = {
  width: '100%',
  marginBottom: '0.65rem',
  padding: '0.45rem 0.5rem',
  borderRadius: '6px',
  border: '1px solid #3a4154',
  background: '#0e1016',
  color: '#e8e8ec',
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
  background: '#0e1016',
  borderRadius: '6px',
  border: '1px solid #2a2f3c',
  fontSize: '0.75rem',
  overflow: 'auto',
  maxHeight: 'min(70vh, 520px)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const block: CSSProperties = { marginBottom: '0.5rem' };

export const fileInput: CSSProperties = { marginBottom: '0.65rem', color: '#b4bac8' };

export const help: CSSProperties = {
  fontSize: '0.78rem',
  color: '#8f96a3',
  margin: '0 0 0.65rem',
  lineHeight: 1.45,
};

export const helpAside: CSSProperties = {
  ...help,
  margin: '0 0 0.75rem',
  padding: '0.5rem 0.6rem',
  background: '#141821',
  borderRadius: '6px',
  border: '1px solid #2a3040',
};

export const btnRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

export const btnSecondary: CSSProperties = {
  ...button,
  background: '#2a3142',
  fontWeight: 500,
  fontSize: '0.8rem',
  padding: '0.35rem 0.65rem',
};
