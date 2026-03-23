import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContextLogger {
  child?(bindings: Record<string, unknown>): RequestContextLogger;
  debug?(bindings: Record<string, unknown>, message?: string): void;
  info?(bindings: Record<string, unknown>, message?: string): void;
  warn?(bindings: Record<string, unknown>, message?: string): void;
  error?(bindings: Record<string, unknown>, message?: string): void;
}

export interface RequestContextValue {
  requestId: string;
  userId: string | null;
  method?: string;
  url?: string;
  logger: RequestContextLogger;
}

export interface RunWithRequestContextOptions {
  requestId: string;
  userId?: string | null;
  method?: string;
  url?: string;
  logger?: RequestContextLogger;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextValue>();
const noopLogger: RequestContextLogger = {
  child() {
    return this;
  },
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function createContextLogger(logger: RequestContextLogger, bindings: Record<string, unknown>): RequestContextLogger {
  return typeof logger.child === "function" ? logger.child(bindings) : logger;
}

export function getRequestContext(): RequestContextValue | null {
  return requestContextStorage.getStore() ?? null;
}

export function getRequestLogger(bindings: Record<string, unknown> = {}): RequestContextLogger | null {
  const context = getRequestContext();

  if (!context) {
    return null;
  }

  return createContextLogger(context.logger, bindings);
}

export function setRequestContextUserId(userId: string): void {
  const context = getRequestContext();

  if (!context || context.userId === userId) {
    return;
  }

  context.userId = userId;
  context.logger = createContextLogger(context.logger, {
    userId
  });
}

export async function runWithRequestContext<T>(
  options: RunWithRequestContextOptions,
  callback: () => Promise<T> | T
): Promise<T> {
  const logger = createContextLogger(options.logger ?? noopLogger, {
    requestId: options.requestId,
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.method ? { method: options.method } : {}),
    ...(options.url ? { url: options.url } : {})
  });

  return requestContextStorage.run(
    {
      requestId: options.requestId,
      userId: options.userId ?? null,
      method: options.method,
      url: options.url,
      logger
    },
    callback
  );
}