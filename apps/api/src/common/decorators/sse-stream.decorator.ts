import { applyDecorators, Header, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiProduces } from '@nestjs/swagger';

/**
 * Composite decorator for SSE endpoints used across realtime cabinets.
 *
 * Always:
 * - `@SkipThrottle()` so rate limiting does not interrupt long-lived streams.
 * - `X-Accel-Buffering: no` and `Cache-Control: no-cache` to disable Nginx buffering
 *   and proxy caching, which would otherwise hold events back from the client.
 * - `@ApiProduces('text/event-stream')` for the Swagger contract.
 */
export function SseStream(path: string): MethodDecorator {
  return applyDecorators(
    SkipThrottle(),
    Sse(path),
    Header('X-Accel-Buffering', 'no'),
    Header('Cache-Control', 'no-cache'),
    ApiProduces('text/event-stream'),
  );
}
