// Web → API HTTP client.
//
// Wraps `fetch` so every call:
//   - includes credentials (HttpOnly session cookie set by the API),
//   - parses RFC 7807 problem responses into a typed `ProblemError`,
//   - reports network failures as a distinct `NetworkError`,
//   - returns the parsed JSON body on success.
//
// The client never touches localStorage. Auth is cookie-based per CLAUDE.md
// (frontend rule 3). Tokens are not visible to JS.

export interface ProblemBody {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  request_id?: string;
  errors?: Array<{ path: string; message: string }>;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly request_id?: string;
  readonly errors?: ProblemBody['errors'];

  constructor(body: ProblemBody) {
    super(body.detail ?? body.title);
    this.name = 'ProblemError';
    this.status = body.status;
    this.title = body.title;
    if (body.detail !== undefined) this.detail = body.detail;
    if (body.request_id !== undefined) this.request_id = body.request_id;
    if (body.errors !== undefined) this.errors = body.errors;
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const API_BASE = '/api/v1';

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseProblem(res: Response): Promise<ProblemError> {
  // RFC 7807 says application/problem+json; some proxies strip the
  // suffix, so we accept any JSON-shaped body and fall back to a
  // synthetic problem if parsing fails.
  try {
    const body = (await res.json()) as ProblemBody;
    if (typeof body?.title === 'string' && typeof body?.status === 'number') {
      return new ProblemError(body);
    }
  } catch {
    // fall through
  }
  return new ProblemError({ title: res.statusText || 'Request failed', status: res.status });
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    if (opts.body instanceof FormData || opts.body instanceof Blob) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Network error');
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await parseProblem(res);

  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  // For non-JSON success (e.g. PDF stream), surface the raw Response
  // by returning it verbatim — callers that want this opt in by typing T = Response.
  return res as unknown as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'DELETE' }),
};
