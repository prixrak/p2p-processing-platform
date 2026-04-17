import { EXTERNAL_API_V1_PREFIX } from '@p2p/shared';

export type Direction = 'payin' | 'payout';

export type EndpointKind = 'json' | 'multipart';

export interface ExternalEndpoint {
  id: string;
  label: string;
  direction: Direction;
  path: string;
  kind: EndpointKind;
  multipart?: 'update_order_with_proofs' | 'appeal_send';
}

function p(path: string) {
  return `${EXTERNAL_API_V1_PREFIX}/${path}`;
}

export const EXTERNAL_ENDPOINTS: ExternalEndpoint[] = [
  {
    id: 'payin-upload_order',
    label: 'Pay-In upload_order',
    direction: 'payin',
    path: p('payin/upload_order'),
    kind: 'json',
  },
  {
    id: 'payin-update_order',
    label: 'Pay-In update_order',
    direction: 'payin',
    path: p('payin/update_order'),
    kind: 'json',
  },
  {
    id: 'payin-update_order_with_proofs',
    label: 'Pay-In update_order_with_proofs',
    direction: 'payin',
    path: p('payin/update_order_with_proofs'),
    kind: 'multipart',
    multipart: 'update_order_with_proofs',
  },
  {
    id: 'payin-order_info',
    label: 'Pay-In order_info',
    direction: 'payin',
    path: p('payin/order_info'),
    kind: 'json',
  },
  {
    id: 'payin-info',
    label: 'Pay-In info',
    direction: 'payin',
    path: p('payin/info'),
    kind: 'json',
  },
  {
    id: 'payin-h2h_init',
    label: 'Pay-In h2h_init',
    direction: 'payin',
    path: p('payin/h2h_init'),
    kind: 'json',
  },
  {
    id: 'payin-h2h_check_availability',
    label: 'Pay-In h2h_check_availability',
    direction: 'payin',
    path: p('payin/h2h_check_availability'),
    kind: 'json',
  },
  {
    id: 'payin-banks',
    label: 'Pay-In banks',
    direction: 'payin',
    path: p('payin/banks'),
    kind: 'json',
  },
  {
    id: 'payin-appeal_send',
    label: 'Pay-In appeal/send',
    direction: 'payin',
    path: p('payin/appeal/send'),
    kind: 'multipart',
    multipart: 'appeal_send',
  },
  {
    id: 'payout-order_upload',
    label: 'Pay-Out order_upload',
    direction: 'payout',
    path: p('payout/order_upload'),
    kind: 'json',
  },
  {
    id: 'payout-order_info',
    label: 'Pay-Out order_info',
    direction: 'payout',
    path: p('payout/order_info'),
    kind: 'json',
  },
  {
    id: 'payout-info',
    label: 'Pay-Out info',
    direction: 'payout',
    path: p('payout/info'),
    kind: 'json',
  },
];

/** Fresh sample JSON each time (timestamps, ids). */
export function getDefaultJsonForEndpoint(endpoint: ExternalEndpoint): string {
  const sec = Math.floor(Date.now() / 1000);
  const ms = Date.now();
  const rid = `req-${ms}`;
  const uuidPlaceholder = '00000000-0000-0000-0000-000000000001';

  switch (endpoint.id) {
    case 'payin-upload_order':
      return JSON.stringify(
        {
          request_id: rid,
          amount: 1000,
          currency: 'UAH',
          user_full_name: 'Test User',
          user_id: 'merchant-user-1',
          callback_url: 'https://example.com/webhook/payin',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payin-update_order':
      return JSON.stringify(
        {
          id: uuidPlaceholder,
          request_id: '',
          status: 'VERIFIED',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payin-order_info':
      return JSON.stringify(
        {
          id: uuidPlaceholder,
          request_id: '',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payin-info':
      return JSON.stringify({}, null, 2);
    case 'payin-h2h_init':
      return JSON.stringify(
        {
          request_id: `h2h-${ms}`,
          amount: 500,
          currency: 'UAH',
          redirect_url: 'https://example.com/payment-done',
          user_full_name: 'H2H Test User',
          user_id: 'h2h-user-1',
          callback_url: 'https://example.com/webhook/payin',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payin-h2h_check_availability':
      return JSON.stringify(
        {
          request_id: `chk-${ms}`,
          amount: 500,
          currency: 'UAH',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payin-banks':
      return JSON.stringify(
        {
          currency: 'UAH',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payout-order_upload':
      return JSON.stringify(
        {
          request_id: `po-${ms}`,
          currency: 'UAH',
          amount: 100,
          details: {
            type: 'CARD',
            number: '4111111111111111',
            owner: 'Test Recipient',
            code: '',
          },
          callback_url: 'https://example.com/webhook/payout',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payout-order_info':
      return JSON.stringify(
        {
          id: uuidPlaceholder,
          request_id: '',
          nonce: sec,
        },
        null,
        2,
      );
    case 'payout-info':
      return JSON.stringify({}, null, 2);
    default:
      return JSON.stringify({ nonce: sec }, null, 2);
  }
}

export type MultipartFormDefaults = {
  status: 'VERIFIED' | 'CANCELED';
  proofId: string;
  proofNonce: string;
  appealOrderId: string;
  appealPaidAmount: string;
  appealNonce: string;
};

export function getDefaultMultipartFields(
  endpoint: ExternalEndpoint,
): Partial<MultipartFormDefaults> | null {
  const sec = Math.floor(Date.now() / 1000);
  const ms = Date.now();
  if (endpoint.multipart === 'update_order_with_proofs') {
    return {
      status: 'VERIFIED',
      proofId: '00000000-0000-0000-0000-000000000001',
      proofNonce: String(sec),
    };
  }
  if (endpoint.multipart === 'appeal_send') {
    return {
      appealOrderId: '00000000-0000-0000-0000-000000000002',
      appealPaidAmount: '100',
      appealNonce: String(ms),
    };
  }
  return null;
}
