import type {
  AuthGateContext,
  PluginConfig,
  RequireAuthOption,
} from "./config";

export type { AuthGateContext } from "./config";

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
