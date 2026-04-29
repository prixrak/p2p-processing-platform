/**
 * Sample key pairs for local playground only (switch via UI or replace manually).
 * Do not use these values in production.
 */

export type DevKeyPair = {
  payinPublicKey: string;
  payinSecret: string;
  payoutPublicKey: string;
  payoutSecret: string;
};

export const DEV_KEY_PRESETS: readonly { id: string; label: string; keys: DevKeyPair }[] = [
  {
    id: 'seed-terminal',
    label: 'Seed / local DB (terminal)',
    keys: {
      payinPublicKey: 'pk_payin_c155f611a295b631b99016fae8cd43d3109ded9809317058',
      payinSecret:
        'sk_payin_ab298c91635ced1e4c6d9b38374b34fa19e7410eb384d537102789c785d611c3',
      payoutPublicKey: 'pk_payout_8a8f385209a376ac10c00d1f651a57c318585ac7fbfb232d',
      payoutSecret:
        'sk_payout_a980a11a47aab58392a5b8081ff22e013f76e1d15ac6f35798d3deec23ba8aa9',
    },
  },
  {
    id: 'pair-a',
    label: 'Pair A (original sample)',
    keys: {
      payinPublicKey: 'pk_payin_3f864b1d695b2e2cce5a90d2841a02cfe0b2b1f6693d1c81',
      payinSecret:
        'sk_payin_ecc0ab3b6210ec6a54e2111b6db5aff804e0a94640746e65d21700dac13ded7a',
      payoutPublicKey: 'pk_payout_72c47d3f3f9e986f9c456123aa238c47b74bdc6922169d77',
      payoutSecret:
        'sk_payout_ee83f5b1da056879df50714a10cca94c5c4884b79039fcaef0f33350a2aa2ed0',
    },
  },
  {
    id: 'pair-b',
    label: 'Pair B',
    keys: {
      payinPublicKey: 'pk_payin_426eba38c9a503352cc6268e6712a7c4c8d1281becd6d918',
      payinSecret:
        'sk_payin_30cb3e2fff2ac844d9f6a79bb2e527edc9fc827a86ed1a31ad408f216e4fe561',
      payoutPublicKey: 'pk_payout_9f1e0732085865459978a9a8a5eea943c53924ec44fc7231',
      payoutSecret:
        'sk_payout_e84a20935f4cfb116dbb7f367f92ac56333482df538a9d6756e8a032b739fe10',
    },
  },
] as const;

/** @deprecated Use DEV_KEY_PRESETS[0].keys — kept for imports expecting this name */
export const DEFAULT_DEV_KEYS: DevKeyPair = DEV_KEY_PRESETS[0].keys;

export function devKeysEqual(a: DevKeyPair, b: DevKeyPair): boolean {
  return (
    a.payinPublicKey === b.payinPublicKey &&
    a.payinSecret === b.payinSecret &&
    a.payoutPublicKey === b.payoutPublicKey &&
    a.payoutSecret === b.payoutSecret
  );
}

export function findDevKeyPresetId(keys: DevKeyPair): string | undefined {
  return DEV_KEY_PRESETS.find((p) => devKeysEqual(p.keys, keys))?.id;
}
