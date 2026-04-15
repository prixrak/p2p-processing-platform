import { BadRequestException } from '@nestjs/common';
import { resolve } from 'dns/promises';

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
  /^::1$/,
  /^::$/,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

export async function validateCallbackUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('callback_url is not a valid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('callback_url must use http or https');
  }

  const hostname = parsed.hostname;

  if (hostname === 'localhost' || hostname === '[::1]') {
    throw new BadRequestException('callback_url must not point to localhost');
  }

  const ipLiteral = hostname.match(/^\[?([^\]]+)]?$/)?.[1] ?? hostname;
  if (isPrivateIp(ipLiteral)) {
    throw new BadRequestException('callback_url must not resolve to a private IP');
  }

  try {
    const addresses = await resolve(hostname);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new BadRequestException(
          `callback_url hostname resolves to a private IP (${addr})`,
        );
      }
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
  }
}
