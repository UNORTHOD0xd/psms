// CTL-09 — Idempotency-Key behaviour. The middleware persists the
// (key, request_hash, response) tuple on a successful 2xx response and
// replays it for retries with the same key + same payload. A retry
// with the same key but a different payload returns 409.

import { describe, expect, it, beforeEach, vi } from 'vitest';

// In-memory store that stands in for prisma.idempotencyKey.
type Row = {
  key: string;
  endpoint: string;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  user_id: string | null;
  expires_at: Date;
};
const store = new Map<string, Row>();

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    idempotencyKey: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        return store.get(where.key) ?? null;
      }),
      upsert: vi.fn(
        async (args: {
          where: { key: string };
          create: Row;
          update: Partial<Row>;
        }) => {
          const cur = store.get(args.where.key);
          if (cur) {
            store.set(args.where.key, { ...cur, ...args.update });
          } else {
            store.set(args.where.key, args.create);
          }
        },
      ),
    },
  },
}));

import { idempotency } from '../../src/middleware/idempotency.js';

interface FakeReq {
  method: string;
  originalUrl: string;
  path: string;
  body: unknown;
  route?: { path: string };
  auth?: { user_id: string };
  headers: Record<string, string>;
  header(name: string): string | undefined;
}

interface FakeRes {
  statusCode: number;
  _body: unknown;
  _type: string | null;
  _problemSent: boolean;
  _finishHandlers: Array<() => void>;
  _ended: boolean;
  status(code: number): FakeRes;
  type(t: string): FakeRes;
  json(body: unknown): FakeRes;
  send(body: unknown): FakeRes;
  end(...args: unknown[]): FakeRes;
  on(event: string, fn: () => void): FakeRes;
  getHeader(name: string): string | undefined;
}

function makeReq(opts: Partial<FakeReq> & { key?: string }): FakeReq {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.key !== undefined) headers['idempotency-key'] = opts.key;
  return {
    method: opts.method ?? 'POST',
    originalUrl: opts.originalUrl ?? '/api/v1/applications',
    path: opts.path ?? '/applications',
    body: opts.body ?? { foo: 'bar' },
    auth: opts.auth,
    route: opts.route,
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    _body: undefined,
    _type: null,
    _problemSent: false,
    _finishHandlers: [],
    _ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(t) {
      this._type = t;
      return this;
    },
    json(body) {
      this._body = body;
      this._ended = true;
      return this;
    },
    send(body) {
      this._body = body;
      this._ended = true;
      return this;
    },
    end() {
      this._ended = true;
      return this;
    },
    on(event, fn) {
      if (event === 'finish') this._finishHandlers.push(fn);
      return this;
    },
    getHeader() {
      return undefined;
    },
  };
  return res;
}

async function run(req: FakeReq, res: FakeRes): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    Promise.resolve(idempotency(req as never, res as never, (err?: unknown) => {
      if (err) reject(err as Error);
      else resolve();
    })).catch(reject);
  });
}

function fireFinish(res: FakeRes): void {
  for (const fn of res._finishHandlers) fn();
}

describe('idempotency middleware (CTL-09)', () => {
  beforeEach(() => store.clear());

  it('is a no-op when the header is absent', async () => {
    const req = makeReq({ method: 'POST', body: { x: 1 } });
    const res = makeRes();
    await run(req, res);
    // No problem sent, request flows through.
    expect(res.statusCode).toBe(200);
    expect(store.size).toBe(0);
  });

  it('rejects malformed keys with 400', async () => {
    const req = makeReq({ key: 'short' });
    const res = makeRes();
    await run(req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body).toMatchObject({ status: 400, title: 'Bad Request' });
  });

  it('persists 2xx responses and replays them on retry', async () => {
    // First call: handler returns a 201.
    const req1 = makeReq({ key: 'aaaaaaaa-bbbb-4444-cccc-dddddddddddd', body: { x: 1 } });
    const res1 = makeRes();
    await run(req1, res1);
    res1.status(201).json({ id: 'app-1' });
    fireFinish(res1);

    // Wait a microtask so the async upsert runs.
    await new Promise((r) => setImmediate(r));
    expect(store.size).toBe(1);

    // Second call: same key, same payload — should replay.
    const req2 = makeReq({ key: 'aaaaaaaa-bbbb-4444-cccc-dddddddddddd', body: { x: 1 } });
    const res2 = makeRes();
    await run(req2, res2);

    expect(res2.statusCode).toBe(201);
    expect(res2._body).toEqual({ id: 'app-1' });
  });

  it('returns 409 when the same key is reused with a different payload', async () => {
    const req1 = makeReq({ key: 'reuseme-conflict-test', body: { x: 1 } });
    const res1 = makeRes();
    await run(req1, res1);
    res1.status(201).json({ id: 'app-1' });
    fireFinish(res1);
    await new Promise((r) => setImmediate(r));

    const req2 = makeReq({ key: 'reuseme-conflict-test', body: { x: 99 } });
    const res2 = makeRes();
    await run(req2, res2);

    expect(res2.statusCode).toBe(409);
    expect(res2._body).toMatchObject({ status: 409, title: 'Conflict' });
  });

  it('does not persist non-2xx responses (so retries are not blocked)', async () => {
    const req1 = makeReq({ key: 'transient-failure-1', body: { x: 1 } });
    const res1 = makeRes();
    await run(req1, res1);
    res1.status(500).json({ title: 'oops' });
    fireFinish(res1);
    await new Promise((r) => setImmediate(r));
    expect(store.size).toBe(0);
  });

  it('treats expired entries as new (TTL-clamped replay)', async () => {
    const key = 'expired-entry-ttl-test';
    store.set(key, {
      key,
      endpoint: 'POST /applications',
      request_hash: 'old-hash',
      response_status: 201,
      response_body: { id: 'old' },
      user_id: null,
      expires_at: new Date(Date.now() - 1000), // already expired
    });
    const req = makeReq({ key, body: { x: 1 } });
    const res = makeRes();
    await run(req, res);
    // Middleware proceeds (next called), no replay, no 409.
    expect(res.statusCode).toBe(200); // default
    expect(res._body).toBeUndefined();
  });
});
