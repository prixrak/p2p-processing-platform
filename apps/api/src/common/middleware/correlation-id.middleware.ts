import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../request-context';

/**
 * Assigns X-Request-Id (from incoming header or new UUID) and binds AsyncLocalStorage for the request.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers['x-request-id'];
  const requestId = typeof raw === 'string' && raw.trim() ? raw.trim() : randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  requestContext.run({ requestId }, () => next());
}
