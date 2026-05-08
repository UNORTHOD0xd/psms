import type { RequestHandler } from 'express';
import { ulid } from 'ulid';

declare module 'http' {
  interface IncomingMessage {
    id: string;
  }
}

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('X-Request-Id');
    const id = incoming && /^[A-Z0-9]{26}$/.test(incoming) ? incoming : ulid();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}
