import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

export type RequestContextStore = {
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type RequestWithUser = Request & {
  user?: { id?: string };
};

const storage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(ctx: RequestContextStore, fn: () => T): T {
  return storage.run(ctx, fn);
}

function clientIp(req: RequestWithUser): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0]?.trim() || null;
  }
  return req.ip || req.socket?.remoteAddress || null;
}

/** Mantém userId/IP/UA disponíveis para o Prisma $extends durante a request. */
export function bindRequestContext(req: RequestWithUser, _res: Response, next: NextFunction): void {
  const ctx: RequestContextStore = {
    userId: req.user?.id,
    ipAddress: clientIp(req),
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
  runWithRequestContext(ctx, () => next());
}
