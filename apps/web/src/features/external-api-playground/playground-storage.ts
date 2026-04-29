import { DEFAULT_DEV_KEYS } from './dev-defaults';

export const LS = {
  payinPk: 'p2p-external-playground-payin-pk',
  payinSk: 'p2p-external-playground-payin-sk',
  payoutPk: 'p2p-external-playground-payout-pk',
  payoutSk: 'p2p-external-playground-payout-sk',
  lastEndpoint: 'p2p-external-playground-last-endpoint',
  useV2: 'p2p-external-playground-use-v2',
  /** JSON body text per endpoint id */
  jsonBodyPrefix: 'p2p-external-playground-json-body-',
} as const;

export function jsonBodyStorageKey(endpointId: string): string {
  return `${LS.jsonBodyPrefix}${endpointId}`;
}

export function loadKeys() {
  if (typeof window === 'undefined') {
    return {
      payinPublicKey: DEFAULT_DEV_KEYS.payinPublicKey,
      payinSecret: DEFAULT_DEV_KEYS.payinSecret,
      payoutPublicKey: DEFAULT_DEV_KEYS.payoutPublicKey,
      payoutSecret: DEFAULT_DEV_KEYS.payoutSecret,
    };
  }
  return {
    payinPublicKey: localStorage.getItem(LS.payinPk) ?? DEFAULT_DEV_KEYS.payinPublicKey,
    payinSecret: localStorage.getItem(LS.payinSk) ?? DEFAULT_DEV_KEYS.payinSecret,
    payoutPublicKey: localStorage.getItem(LS.payoutPk) ?? DEFAULT_DEV_KEYS.payoutPublicKey,
    payoutSecret: localStorage.getItem(LS.payoutSk) ?? DEFAULT_DEV_KEYS.payoutSecret,
  };
}
