import type {
  AuthGateContext,
  DraftPreviewContext,
  PluginConfig,
  RequireAuthOption,
} from "./config";

export type { AuthGateContext, DraftPreviewContext } from "./config";

interface RestCtx {
  request: { header: Record<string, string | string[] | undefined> };
  query: Record<string, unknown>;
}

export function detectRestSignals(
  ctx: RestCtx,
  config: PluginConfig,
): { header: boolean; nativeRest: boolean } {
  const headerValue = ctx.request.header[config.headerName];
  const header = headerValue === config.expectedHeaderValue;
  const nativeRest = ctx.query.status === config.statusValue;

  return { header, nativeRest };
}

/**
 * Built-in auth check based on `ctx.state.auth.strategy.name`.
 *
 * Used by `runGate` when `config.requireAuth` is set. The plugin injects
 * its Koa middleware as a per-route middleware in `register.ts`, which
 * runs AFTER Strapi's `authenticate` strategy in the route pipeline —
 * so `ctx.state.auth` is populated by the time we read it.
 */
export function checkBuiltInAuth(
  ctx: AuthGateContext,
  requireAuth: RequireAuthOption | undefined,
): boolean {
  if (!requireAuth) return false;

  const strategyName = ctx.state?.auth?.strategy?.name;

  if (requireAuth === true) {
    return strategyName === "api-token" || strategyName === "admin";
  }

  return strategyName === requireAuth;
}

export async function runGate(
  ctx: AuthGateContext,
  config: PluginConfig,
): Promise<boolean> {
  if (config.authorize) {
    try {
      // The user's `authorize` callback is typed against the wider
      // `DraftPreviewContext` (Koa context + Strapi state) so users get
      // IDE autocomplete in their predicates. Internally we pass the
      // narrower `AuthGateContext`; production callers always pass real
      // Koa contexts that satisfy the wider type. The `unknown` bridge
      // is the safe TS idiom for this — no `any` involved.
      return Boolean(
        await config.authorize(ctx as unknown as DraftPreviewContext),
      );
    } catch {
      return false;
    }
  }

  if (config.requireAuth) {
    return checkBuiltInAuth(ctx, config.requireAuth);
  }

  return process.env.NODE_ENV !== "production";
}
