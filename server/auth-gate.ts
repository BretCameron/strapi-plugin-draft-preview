import type { AuthGateContext, PluginConfig } from "./config";

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
