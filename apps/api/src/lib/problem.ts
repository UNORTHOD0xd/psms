import type { Response } from 'express';

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  request_id?: string;
  errors?: Array<{ path: string; message: string }>;
}

export class HttpProblem extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly type?: string;
  readonly errors?: ProblemDetails['errors'];

  constructor(input: { status: number; title: string; detail?: string; type?: string; errors?: ProblemDetails['errors'] }) {
    super(input.detail ?? input.title);
    this.status = input.status;
    this.title = input.title;
    if (input.detail !== undefined) this.detail = input.detail;
    if (input.type !== undefined) this.type = input.type;
    if (input.errors !== undefined) this.errors = input.errors;
  }
}

export const Problems = {
  badRequest: (detail?: string, errors?: ProblemDetails['errors']) =>
    new HttpProblem({ status: 400, title: 'Bad Request', detail, errors }),
  unauthorized: (detail = 'Authentication required') =>
    new HttpProblem({ status: 401, title: 'Unauthorized', detail }),
  forbidden: (detail = 'Insufficient role') =>
    new HttpProblem({ status: 403, title: 'Forbidden', detail }),
  notFound: (detail = 'Resource not found') =>
    new HttpProblem({ status: 404, title: 'Not Found', detail }),
  conflict: (detail?: string) => new HttpProblem({ status: 409, title: 'Conflict', detail }),
  gone: (detail?: string) => new HttpProblem({ status: 410, title: 'Gone', detail }),
  unprocessable: (detail?: string) =>
    new HttpProblem({ status: 422, title: 'Unprocessable Entity', detail }),
  tooMany: (detail = 'Rate limit exceeded') =>
    new HttpProblem({ status: 429, title: 'Too Many Requests', detail }),
};

export function sendProblem(res: Response, p: HttpProblem): void {
  const body: ProblemDetails = {
    type: p.type ?? 'about:blank',
    title: p.title,
    status: p.status,
    request_id: res.getHeader('X-Request-Id')?.toString(),
  };
  if (p.detail !== undefined) body.detail = p.detail;
  if (p.errors !== undefined) body.errors = p.errors;
  res.status(p.status).type('application/problem+json').json(body);
}
