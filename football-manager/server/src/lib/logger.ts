import type { FastifyBaseLogger } from 'fastify';

/** Contexto estándar para logs estructurados (pino). */
export type LogContext = Record<string, string | number | boolean | null | undefined>;

let root: FastifyBaseLogger | null = null;

export function bindRootLogger(log: FastifyBaseLogger): void {
  root = log;
}

export function getLogger(): FastifyBaseLogger {
  if (!root) {
    throw new Error('Logger no inicializado — llama bindRootLogger tras crear Fastify');
  }
  return root;
}

/** Hijo con contexto fijo (módulo, job, clubId, etc.). */
export function childLogger(bindings: LogContext): FastifyBaseLogger {
  return getLogger().child(bindings);
}

export function logInfo(msg: string, ctx?: LogContext): void {
  getLogger().info(ctx ?? {}, msg);
}

export function logWarn(msg: string, ctx?: LogContext): void {
  getLogger().warn(ctx ?? {}, msg);
}

export function logError(msg: string, err?: unknown, ctx?: LogContext): void {
  const payload = { ...ctx, err: err instanceof Error ? err : undefined };
  getLogger().error(payload, msg);
}
