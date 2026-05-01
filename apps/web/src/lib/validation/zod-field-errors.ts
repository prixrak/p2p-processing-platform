import type { ZodError } from 'zod';

/** Maps first issue per dot-path for pairing with field `error` props. */
export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}
