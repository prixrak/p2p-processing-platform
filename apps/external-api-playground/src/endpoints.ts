import { EXTERNAL_API_V1_PREFIX } from '@p2p/shared';

export type Direction = 'payin' | 'payout';

export type EndpointKind = 'json' | 'multipart';

export interface ExternalEndpoint {
  id: string;
  label: string;
  direction: Direction;
  /** Path after prefix, e.g. `payin/upload_order` */
  path: string;
  kind: EndpointKind;
  /** Default JSON string for `json` kind */
  defaultJson: string;
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
    defaultJson: JSON.stringify(
      {
        request_id: `req-${Date.now()}`,
        amount: 1000,
        currency: 'UAH',
        user_full_name: 'Test User',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payin-update_order',
    label: 'Pay-In update_order',
    direction: 'payin',
    path: p('payin/update_order'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        id: '',
        request_id: '',
        status: 'VERIFIED',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payin-update_order_with_proofs',
    label: 'Pay-In update_order_with_proofs',
    direction: 'payin',
    path: p('payin/update_order_with_proofs'),
    kind: 'multipart',
    multipart: 'update_order_with_proofs',
    defaultJson: '',
  },
  {
    id: 'payin-order_info',
    label: 'Pay-In order_info',
    direction: 'payin',
    path: p('payin/order_info'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        id: '',
        request_id: '',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payin-info',
    label: 'Pay-In info',
    direction: 'payin',
    path: p('payin/info'),
    kind: 'json',
    defaultJson: JSON.stringify({}, null, 2),
  },
  {
    id: 'payin-h2h_init',
    label: 'Pay-In h2h_init',
    direction: 'payin',
    path: p('payin/h2h_init'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        request_id: `h2h-${Date.now()}`,
        amount: 500,
        currency: 'UAH',
        redirect_url: 'https://example.com/done',
        user_full_name: 'H2H User',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payin-h2h_check_availability',
    label: 'Pay-In h2h_check_availability',
    direction: 'payin',
    path: p('payin/h2h_check_availability'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        request_id: `chk-${Date.now()}`,
        amount: 500,
        currency: 'UAH',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payin-banks',
    label: 'Pay-In banks',
    direction: 'payin',
    path: p('payin/banks'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        currency: 'UAH',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payin-appeal_send',
    label: 'Pay-In appeal/send',
    direction: 'payin',
    path: p('payin/appeal/send'),
    kind: 'multipart',
    multipart: 'appeal_send',
    defaultJson: '',
  },
  {
    id: 'payout-order_upload',
    label: 'Pay-Out order_upload',
    direction: 'payout',
    path: p('payout/order_upload'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        request_id: `po-${Date.now()}`,
        currency: 'UAH',
        amount: 100,
        details: { type: 'CARD', number: '4111111111111111', owner: 'Test', code: '' },
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payout-order_info',
    label: 'Pay-Out order_info',
    direction: 'payout',
    path: p('payout/order_info'),
    kind: 'json',
    defaultJson: JSON.stringify(
      {
        id: '',
        request_id: '',
        nonce: Math.floor(Date.now() / 1000),
      },
      null,
      2,
    ),
  },
  {
    id: 'payout-info',
    label: 'Pay-Out info',
    direction: 'payout',
    path: p('payout/info'),
    kind: 'json',
    defaultJson: JSON.stringify({}, null, 2),
  },
];
