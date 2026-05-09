import { getRefreshToken, getToken } from '@/lib/auth';
import { internalPaths } from '@/lib/internal-api';
import {
  hydrateSessionIfNeeded,
  refreshSession,
  shouldHydrateAuthForPath,
} from '@/lib/session-refresh';
import { notifySessionTerminated } from '@/lib/auth-session-redirect';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`${API_BASE}${path}`, 'http://localhost');
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }
  return url.pathname + url.search;
}

function authHeaders(
  token: string | null,
  initHeaders?: HeadersInit,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(initHeaders as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJsonWithRefresh(
  urlPath: string,
  init?: RequestInit,
): Promise<{ res: Response; hadStoredCredentials: boolean }> {
  let res: Response | undefined;
  /** Snapshot before hydrate on first attempt — detects session end after successful token clear during refresh. */
  let hadStoredCredentials = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 0) {
      hadStoredCredentials =
        typeof window !== 'undefined' &&
        !!(getRefreshToken() || getToken());
      await hydrateSessionIfNeeded(urlPath);
    }

    const token = getToken();
    res = await fetch(`${API_BASE}${urlPath}`, {
      ...init,
      headers: authHeaders(token, init?.headers),
    });

    const eligible =
      attempt === 0 &&
      res.status === 401 &&
      typeof window !== 'undefined' &&
      shouldHydrateAuthForPath(urlPath);

    if (!eligible || (await refreshSession()) === false) {
      break;
    }
  }

  return { res: res!, hadStoredCredentials };
}

async function parseJsonResponse<T>(
  res: Response,
  gatedPath?: string,
  hadStoredCredentials?: boolean,
): Promise<T> {
  if (!res.ok) {
    if (
      res.status === 401 &&
      gatedPath &&
      hadStoredCredentials &&
      typeof window !== 'undefined' &&
      shouldHydrateAuthForPath(gatedPath)
    ) {
      notifySessionTerminated();
    }
    const fallbackMessage = 'Unable to complete the request. Please try again.';
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      const message =
        typeof body.message === 'string' && body.message.trim()
          ? body.message.trim()
          : fallbackMessage;
      throw new ApiError(res.status, body.code ?? 'UNKNOWN', message);
    }
    await res.text().catch(() => '');
    throw new ApiError(res.status, 'FETCH_FAILED', fallbackMessage);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { res, hadStoredCredentials } = await fetchJsonWithRefresh(path, init);
  return parseJsonResponse<T>(res, path, hadStoredCredentials);
}

export type ApiGetClockOffsetResult<T> = { data: T; clockOffsetMs: number };

/** GET JSON plus server clock skew from HTTP `Date` (for countdowns aligned with `autocloseAt`). */
async function requestGetWithClockOffset<T>(
  fullPath: string,
): Promise<ApiGetClockOffsetResult<T>> {
  const { res, hadStoredCredentials } = await fetchJsonWithRefresh(fullPath, {
    method: 'GET',
  });
  const data = await parseJsonResponse<T>(
    res,
    fullPath,
    hadStoredCredentials,
  );

  const dateHeader = res.headers.get('Date') ?? res.headers.get('date');
  const serverMs = dateHeader ? Date.parse(dateHeader) : Number.NaN;
  const clockOffsetMs = Number.isFinite(serverMs) ? serverMs - Date.now() : 0;

  return { data, clockOffsetMs };
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) => {
    const url = params ? buildUrl(path, params) : path;
    return request<T>(url, { method: 'GET' });
  },

  getWithClockOffset: <T>(path: string, params?: Record<string, string>) => {
    const url = params ? buildUrl(path, params) : path;
    return requestGetWithClockOffset<T>(url);
  },

  /** Signed GET URLs cannot follow API→S3 redirects in fetch() due to CORS; response includes mimeType for previews (no extra metadata request). */
  getFileSignedUrl: (fileId: string) =>
    request<{ url: string; mimeType: string }>(internalPaths.fileSignedUrl(fileId)),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    let lastRes: Response | undefined;
    let hadStoredCredentials = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 0) {
        hadStoredCredentials =
          typeof window !== 'undefined' &&
          !!(getRefreshToken() || getToken());
        await hydrateSessionIfNeeded(path);
      }

      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      lastRes = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        body: formData,
        headers,
      });

      const eligible =
        attempt === 0 &&
        lastRes.status === 401 &&
        typeof window !== 'undefined' &&
        shouldHydrateAuthForPath(path);

      if (!eligible || (await refreshSession()) === false) {
        break;
      }
    }

    const res = lastRes!;

    if (!res.ok) {
      if (
        res.status === 401 &&
        hadStoredCredentials &&
        typeof window !== 'undefined' &&
        shouldHydrateAuthForPath(path)
      ) {
        notifySessionTerminated();
      }
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        body.code ?? 'UPLOAD_FAILED',
        body.message ?? 'Upload failed',
      );
    }

    return res.json() as Promise<T>;
  },
};

export async function fetchOrder(id: string) {
  const res = await fetch(`${API_BASE}${internalPaths.payOrder(id)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('PAYMENT_LOAD_FAILED');
  }
  return res.json();
}

export async function confirmPayment(orderId: string, files?: File[]) {
  if (files && files.length > 0) {
    const formData = new FormData();
    formData.append('orderId', orderId);
    files.forEach((file) => formData.append('files', file));
    return api.upload(internalPaths.payOrderConfirm(orderId), formData);
  }
  return api.post(internalPaths.payOrderConfirm(orderId), { orderId });
}
