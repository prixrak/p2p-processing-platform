import { formatErrorMessage } from '@/lib/format-error';

export function errorMessageFromUnknown(err: unknown): string {
  return formatErrorMessage(err);
}
