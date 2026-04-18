import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import type { Options } from 'pino-http';
import type { Params } from 'nestjs-pino';
import pino from 'pino';
import type { Request } from 'express';
import type { Level } from 'pino';
import { config as appConfig } from '@p2p/config';

/**
 * Human-readable terminal output (colors, indented objects). JSON in production and when LOG_PRETTY=0.
 * Force with LOG_PRETTY=1 even in non-dev (use sparingly).
 */
export function useHumanReadableConsole(): boolean {
  if (process.env.LOG_PRETTY === '0' || process.env.LOG_PRETTY === 'false') {
    return false;
  }
  if (process.env.LOG_PRETTY === '1' || process.env.LOG_PRETTY === 'true') {
    return true;
  }
  if (appConfig.app.nodeEnv === 'production') {
    return false;
  }
  if (appConfig.app.nodeEnv === 'test') {
    return false;
  }
  return true;
}

/** Headers allowed on serialized `req` (values only; sensitive auth headers are never copied). */
const SAFE_REQ_HEADER_NAMES = new Set([
  'host',
  'user-agent',
  'accept',
  'content-type',
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
]);

function requestPath(req: Request): string {
  if (typeof req.path === 'string' && req.path.length > 0) {
    return req.path;
  }
  const u = req.url ?? '';
  return u.split('?')[0] ?? '';
}

/**
 * Minimized request serializer: no raw headers, no bodies, no auth material.
 */
export function safeSerializeReq(req: IncomingMessage): Record<string, unknown> {
  const r = req as Request;
  const headers: Record<string, string> = {};
  for (const name of SAFE_REQ_HEADER_NAMES) {
    const v = r.headers[name];
    if (typeof v === 'string') headers[name] = v;
    else if (Array.isArray(v) && v[0]) headers[name] = v[0];
  }

  return {
    id: (r as Request & { id?: string }).id,
    method: r.method,
    path: requestPath(r),
    query:
      r.query && typeof r.query === 'object' && Object.keys(r.query).length > 0
        ? r.query
        : undefined,
    headers,
    remoteAddress: r.socket?.remoteAddress,
    remotePort: r.socket?.remotePort,
  };
}

function safeSerializeRes(res: ServerResponse): { statusCode: number } {
  return { statusCode: res.statusCode ?? 0 };
}

export function shouldIgnoreHealthAccessLog(req: IncomingMessage): boolean {
  const originalUrl = (req as Request).originalUrl;
  const url = originalUrl ?? req.url ?? '';
  const pathOnly = url.split('?')[0];
  return pathOnly === '/api/health' || pathOnly.startsWith('/api/health/');
}

function customProps(req: IncomingMessage, _res: ServerResponse): Record<string, unknown> {
  const r = req as Request & {
    user?: Record<string, unknown>;
    merchantId?: string;
  };
  const out: Record<string, unknown> = {};
  const user = r.user;
  if (user && typeof user === 'object') {
    if (typeof user.id === 'string') out.userId = user.id;
    if (typeof user.role === 'string') out.authRole = user.role;
    if (user.merchantId) out.cabinetMerchantId = user.merchantId;
    if (user.traderId) out.traderId = user.traderId;
  }
  if (typeof r.merchantId === 'string') out.externalMerchantId = r.merchantId;
  return out;
}

function genReqId(req: IncomingMessage, _res: ServerResponse): string {
  const preset = (req as Request & { id?: string }).id;
  if (typeof preset === 'string' && preset.trim()) {
    return preset.trim().slice(0, 128);
  }
  const h = req.headers;
  const rid = typeof h['x-request-id'] === 'string' ? h['x-request-id'].trim() : '';
  if (rid) return rid.slice(0, 128);
  const cid =
    typeof h['x-correlation-id'] === 'string' ? h['x-correlation-id'].trim() : '';
  if (cid) return cid.slice(0, 128);
  return randomUUID();
}

function requestLine(req: IncomingMessage): string {
  const r = req as Request;
  return `${r.method} ${requestPath(r)}`;
}

function accessLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  err?: Error,
): Level {
  if (err) return 'error';
  const code = res.statusCode;
  if (code >= 500) return 'error';
  if (code >= 400) return 'warn';
  return 'info';
}

function buildPinoHttpOptions(): Options {
  const level =
    process.env.LOG_LEVEL ?? (appConfig.app.nodeEnv === 'production' ? 'info' : 'debug');

  const pretty = useHumanReadableConsole();

  return {
    level,
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    }),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["authorization"]',
        'req.headers["cookie"]',
        'req.headers["x-api-key"]',
        'req.headers["x-api-payload"]',
        'req.headers["x-api-signature"]',
      ],
      censor: '[Redacted]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: safeSerializeReq,
      res: safeSerializeRes,
    },
    genReqId,
    customProps,
    customLogLevel: accessLogLevel,
    autoLogging: {
      ignore: shouldIgnoreHealthAccessLog,
    },
    customSuccessMessage: (req, res, responseTime) =>
      `${requestLine(req)}  ${res.statusCode}  ${responseTime}ms`,
    customErrorMessage: (req, res, err) =>
      `${requestLine(req)}  ${res.statusCode}  ${err.message}`,
  };
}

export function createPinoParams(): Params {
  return {
    pinoHttp: buildPinoHttpOptions(),
  };
}
