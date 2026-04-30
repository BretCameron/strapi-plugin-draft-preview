import { detectRestSignals, runGate } from "./auth-gate";
import type { PluginConfig } from "./config";

interface KoaContext {
  path: string;
  request: { header: Record<string, string | string[] | undefined> };
  query: Record<string, unknown>;
  state?: {
    auth?: { strategy?: { name?: string }; credentials?: unknown };
  };
}

interface CreateKoaMiddlewareOptions {
  config: PluginConfig;
  apiPrefix: string;
}

/**
 * Koa middleware that applies the draft-preview auth gate to REST requests
 * under `apiPrefix`. On allow with header, sets `ctx.query.status` to the
 * configured statusValue. On deny with `guardNativeStatus`, rewrites a
 * native `?status=draft` to "published".
 */
export function createKoaMiddleware({
  config,
  apiPrefix,
}: CreateKoaMiddlewareOptions) {
  const normalisedPrefix =
    apiPrefix.endsWith("/") && apiPrefix.length > 1
      ? apiPrefix.slice(0, -1)
      : apiPrefix;

  return async function includeDraftsRestMiddleware(
    ctx: KoaContext,
    next: () => Promise<void>,
  ) {
    if (!ctx.path.startsWith(normalisedPrefix)) {
      return next();
    }

    const { header, nativeRest } = detectRestSignals(ctx, config);

    if (!header && !nativeRest) {
      return next();
    }

    const allowed = await runGate(ctx, config);

    if (allowed) {
      // Honour an explicit `?status=published` from the caller.
      if (header && ctx.query.status === undefined) {
        ctx.query.status = config.statusValue;
      }
    } else if (nativeRest && config.guardNativeStatus) {
      ctx.query.status = "published";
    }
    // header on deny: silent fallback, no mutation.

    return next();
  };
}
