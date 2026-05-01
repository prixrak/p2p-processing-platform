import { getToken } from '@/lib/auth';
import { internalPaths } from '@/lib/internal-api';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
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

export const api = {
  get: <T>(path: string, params?: Record<string, string>) => {
    const url = params ? buildUrl(path, params) : path;
    return request<T>(url, { method: 'GET' });
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
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: formData,
      headers,
    });

    if (!res.ok) {
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
