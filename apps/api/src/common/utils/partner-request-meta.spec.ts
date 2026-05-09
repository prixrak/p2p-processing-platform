import type { Request } from 'express';
import {
  buildExternalOrderCreationMeta,
  externalMerchantApiPathFromRequest,
  resolvePartnerIp,
} from './partner-request-meta';

describe('partner-request-meta', () => {
  it('resolvePartnerIp prefers first X-Forwarded-For hop', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
      ip: '127.0.0.1',
    } as unknown as Request;
    expect(resolvePartnerIp(req)).toBe('203.0.113.10');
  });

  it('resolvePartnerIp falls back to req.ip', () => {
    const req = { headers: {}, ip: '192.168.1.20' } as unknown as Request;
    expect(resolvePartnerIp(req)).toBe('192.168.1.20');
  });

  it('externalMerchantApiPathFromRequest strips query string', () => {
    const req = {
      originalUrl: '/api/external/v1/payin/upload_order?debug=1',
    } as unknown as Request;
    expect(externalMerchantApiPathFromRequest(req)).toBe('/api/external/v1/payin/upload_order');
  });

  it('buildExternalOrderCreationMeta bundles ip and path', () => {
    const req = {
      headers: { 'x-forwarded-for': '198.51.100.2' },
      ip: '127.0.0.1',
      originalUrl: '/api/external/v1/payout/order_upload',
    } as unknown as Request;
    expect(buildExternalOrderCreationMeta(req)).toEqual({
      partnerIp: '198.51.100.2',
      externalApiPath: '/api/external/v1/payout/order_upload',
    });
  });
});
