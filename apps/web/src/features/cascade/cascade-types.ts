/**
 * Local re-exports — the source of truth for these cabinet-facing types now lives in
 * `@p2p/shared` so BE responses and FE consumers cannot drift apart. Keep this file as a
 * compatibility shim so feature components can keep importing from `./cascade-types`.
 */
export type {
  CascadeSettings,
  NominalRow,
  CascadeMethodPolicy,
} from '@p2p/shared';
