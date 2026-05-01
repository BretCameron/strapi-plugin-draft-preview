import type { Core } from "@strapi/strapi";
import { createKoaMiddleware } from "./koa-middleware";
import type { PluginConfig } from "./config";

/**
 * Returns a draft-preview Koa middleware bound to this Strapi instance's
 * plugin config. Use this if you have routes that the plugin's automatic
 * injection doesn't reach — e.g. custom routes hand-rolled via
 * `strapi.server.routes(...)` outside the conventional `src/api/` and
 * plugin route layout.
 *
 * Example:
 *
 * ```ts
 * import { createDraftPreviewMiddleware } from "strapi-plugin-draft-preview/middleware";
 *
 * // In a custom route's middlewares config, or wherever you compose
 * // your route pipeline:
 * const middleware = createDraftPreviewMiddleware({ strapi });
 * ```
 *
 * The returned middleware reads the plugin's configured headerName,
 * statusValue, authorize, requireAuth, and guardNativeStatus from
 * `strapi.config.get('plugin::draft-preview')`, so you only configure
 * the gate in one place.
 */
export function createDraftPreviewMiddleware({
  strapi,
}: {
  strapi: Core.Strapi;
}) {
  const pluginConfig = strapi.config.get<PluginConfig>("plugin::draft-preview");
  const apiPrefix = strapi.config.get<string>("api.rest.prefix") ?? "/api";
  return createKoaMiddleware({ config: pluginConfig, apiPrefix });
}
