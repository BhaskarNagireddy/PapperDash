/**
 * The website's client for the core API. One domain: the browser calls /v1/* on papperdash.se, so the HttpOnly
 * session cookie is first-party and sent automatically. Server Components call core directly (CORE_URL).
 */

/** The backend's error body: { error, message } with a stable machine code and a human message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSec?: number,
    /** Field problems for a validation_failed answer. */
    readonly issues?: ReadonlyArray<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Fetch = typeof fetch;

export function apiUrl(path: string, onServer = typeof window === 'undefined'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return onServer ? `${process.env.CORE_URL ?? 'http://localhost:4000'}/v1${p}` : `/v1${p}`;
}

/** Calls the API and returns its JSON, or throws ApiError with the server's message (shown to the customer as is). */
export async function api<T>(path: string, init: RequestInit = {}, fetchImpl: Fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(apiUrl(path), {
      ...init,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'network', 'No connection. Check your internet and try again.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string | string[];
    retryAfterSec?: number;
    issues?: Array<{ path: string; message: string }>;
  } | null;
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new ApiError(res.status, body?.error ?? `http_${res.status}`, message ?? 'Something went wrong on our side. Try again in a minute.', body?.retryAfterSec, body?.issues);
  }
  return body as T;
}
