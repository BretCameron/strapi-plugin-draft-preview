import type { PluginConfig } from "./config";

interface KoaContext {
  path: string;
  request: { header: Record<string, string | string[] | undefined> };
  query: Record<string, unknown>;
}

interface CreateKoaMiddlewareOptions {
  config: PluginConfig;
  apiPrefix: string;
}

/**
 * Koa middleware that injects `status: "<statusValue>"` into the REST
 * request's query string when the configured header is set.
 *
 * Strapi v5's REST controllers read `ctx.query.status` and pass it through
 * to `strapi.documents().findMany({ status, ... })`. Relation populates
 * over REST inherit the parent document's status by default (no
 * rootQueryArgs trickery needed, unlike GraphQL), so simply forwarding the
 * status query param is enough.
 *
 * Defensive guards:
 *   - Only acts on requests under the configured REST API prefix
 *     (`api.rest.prefix`, default `/api`). Admin and GraphQL routes are
 *     untouched.
 *   - Honours an explicit `status` query param. A request that already
 *     passes `?status=published` keeps that value.
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

    const headerValue = ctx.request.header[config.headerName];

    if (headerValue !== config.expectedHeaderValue) {
      return next();
    }

    if (ctx.query.status === undefined) {
      ctx.query.status = config.statusValue;
    }

    return next();
  };
}
