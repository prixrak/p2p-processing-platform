import type { NextFunction, Request, Response } from 'express';
import { ErrorDetails } from '@p2p/shared';
import { getRequestIdFromContext } from '../request-context';

/**
 * Closes slow HTTP requests with 408. Skips long-lived SSE routes (path contains `/stream`).
 * For SSE at scale, also cap concurrent streams / read timeouts at your reverse proxy (e.g. nginx).
 */
export function requestTimeoutMiddleware(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (timeoutMs <= 0) {
      next();
      return;
    }
    if (req.path.includes('/stream')) {
      next();
      return;
    }
    const t = setTimeout(() => {
      if (!res.headersSent) {
        const details: Record<string, unknown> = {};
        const requestId = getRequestIdFromContext();
        if (requestId) {
          details.requestId = requestId;
        }
        const body: ErrorDetails = {
          timestamp: new Date().toISOString(),
          message: 'Request timeout',
          code: 'REQUEST_TIMEOUT',
          details,
        };
        res.status(408).json(body);
      }
    }, timeoutMs);
    const clear = (): void => {
      clearTimeout(t);
    };
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
}
