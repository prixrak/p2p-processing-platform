import { Logger } from '@nestjs/common';

/** Fields commonly present on AWS SDK v3 client errors. */
type AwsLikeError = Error & {
  name?: string;
  Code?: string;
  code?: string;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    extendedRequestId?: string;
  };
};

export type ExternalErrorSummary = {
  errorType?: string;
  errorMessage?: string;
  httpStatusCode?: number;
  awsRequestId?: string;
  awsExtendedRequestId?: string;
  awsErrorCode?: string;
  causeMessage?: string;
};

/**
 * Turns thrown values from HTTP clients, AWS SDK, etc. into a flat object safe for structured logs.
 */
export function summarizeExternalError(error: unknown): ExternalErrorSummary {
  if (!(error instanceof Error)) {
    return {
      errorType: typeof error,
      errorMessage: String(error),
    };
  }

  const e = error as AwsLikeError;
  const meta = e.$metadata;
  const code = typeof e.Code === 'string' ? e.Code : typeof e.code === 'string' ? e.code : undefined;

  let causeMessage: string | undefined;
  if (error.cause instanceof Error) {
    causeMessage = error.cause.message;
  }

  return {
    errorType: e.name,
    errorMessage: e.message,
    httpStatusCode: meta?.httpStatusCode,
    awsRequestId: meta?.requestId,
    awsExtendedRequestId: meta?.extendedRequestId,
    awsErrorCode: code,
    causeMessage,
  };
}

export type LogExternalFailureParams = {
  integration: string;
  operation: string;
  /** Non-sensitive correlation fields (bucket, method name, URL origin, etc.). */
  context?: Record<string, unknown>;
  error: unknown;
  level?: 'error' | 'warn';
};

/**
 * Logs a failed outbound call with consistent structured fields, then callers typically rethrow or handle.
 */
export function logExternalFailure(logger: Logger, params: LogExternalFailureParams): void {
  const { integration, operation, context = {}, error, level = 'error' } = params;
  const summary = summarizeExternalError(error);
  const payload = {
    integration,
    operation,
    ...context,
    ...summary,
  };
  const headline = `${integration} ${operation} failed`;
  const detail = summary.errorMessage ?? (error instanceof Error ? error.message : String(error));

  if (level === 'warn') {
    logger.warn({ ...payload }, `${headline}: ${detail}`);
  } else {
    logger.error({ ...payload }, error instanceof Error ? error.stack ?? detail : detail);
  }
}

export type LogHttpFailureParams = {
  integration: string;
  operation: string;
  context?: Record<string, unknown>;
  status: number;
  statusText?: string;
  bodyPreview?: string;
  level?: 'error' | 'warn';
};

/** Use when `fetch` returned a non-OK status (body already read or truncated by caller). */
export function logHttpResponseFailure(logger: Logger, params: LogHttpFailureParams): void {
  const {
    integration,
    operation,
    context = {},
    status,
    statusText,
    bodyPreview,
    level = 'warn',
  } = params;

  const payload = {
    integration,
    operation,
    ...context,
    httpStatusCode: status,
    httpStatusText: statusText,
    ...(bodyPreview !== undefined && bodyPreview !== ''
      ? { responseBodyPreview: truncatePreview(bodyPreview, 512) }
      : {}),
  };

  const headline = `${integration} ${operation} HTTP ${status}`;
  if (level === 'warn') {
    logger.warn(payload, headline);
  } else {
    logger.error(payload, headline);
  }
}

function truncatePreview(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}
