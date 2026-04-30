import type { Core } from "@strapi/strapi";
import { createApolloPlugin } from "./apollo-plugin";
import { createKoaMiddleware } from "./koa-middleware";
import type { AuthGateContext, PluginConfig, RequireAuthOption } from "./config";

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const pluginConfig = strapi.config.get<PluginConfig>("plugin::draft-preview");

  warnIfProductionWithoutGate(strapi, pluginConfig);
  registerGraphqlSupport(strapi, pluginConfig);
  registerRestSupport(strapi, pluginConfig);
};

function warnIfProductionWithoutGate(
  strapi: Core.Strapi,
  pluginConfig: PluginConfig,
) {
  if (process.env.NODE_ENV !== "production") return;
  if (pluginConfig.authorize || pluginConfig.requireAuth) return;

  strapi.log.warn(
    "[draft-preview] running in production with no auth gate; preview header will be ignored. " +
      "Set 'authorize' or 'requireAuth' in plugin config, or use 'authorize: () => true' to keep v1.0.0 behaviour.",
  );
}

function registerGraphqlSupport(
  strapi: Core.Strapi,
  pluginConfig: PluginConfig,
) {
  const graphql = strapi.plugin("graphql");

  if (!graphql) {
    strapi.log.info(
      "[strapi-plugin-draft-preview] @strapi/plugin-graphql is not installed; " +
        "skipping GraphQL support. REST support is unaffected.",
    );
    return;
  }

  const apolloPlugin = createApolloPlugin(pluginConfig);

  // Append to the GraphQL plugin's apolloServer.plugins array. The Strapi
  // GraphQL plugin merges this into the Apollo Server config at boot.
  const existing =
    strapi.config.get<unknown[]>("plugin::graphql.apolloServer.plugins") ?? [];

  strapi.config.set("plugin::graphql.apolloServer.plugins", [
    ...existing,
    apolloPlugin,
  ]);
}

function registerRestSupport(strapi: Core.Strapi, pluginConfig: PluginConfig) {
  const apiPrefix = strapi.config.get<string>("api.rest.prefix") ?? "/api";

  // Our Koa middleware runs at the global app level, before Strapi's
  // per-route `authenticate` middleware populates `ctx.state.auth`.
  // When `requireAuth` is set and no `authorize` override is provided,
  // we translate `requireAuth` into an `authorize` callback that directly
  // checks the Bearer token via Strapi's api-token service — bypassing
  // the need for a pre-populated `ctx.state.auth`.
  const config =
    pluginConfig.requireAuth && !pluginConfig.authorize
      ? {
          ...pluginConfig,
          authorize: buildRequireAuthAuthorize(strapi, pluginConfig.requireAuth),
        }
      : pluginConfig;

  const middleware = createKoaMiddleware({ config, apiPrefix });

  // strapi.server.app is a Koa app; .use prepends to the middleware stack.
  // Registering here means our middleware runs before route handlers but
  // after Strapi's own request-parsing chain.
  (strapi.server.app as { use: (mw: unknown) => void }).use(middleware);
}

/**
 * Builds an `authorize` callback that honours `requireAuth` at the global
 * Koa middleware level, where `ctx.state.auth` is not yet populated.
 *
 * Priority:
 *   1. `ctx.state.auth.strategy.name` — works if auth is already populated
 *      (e.g. if architecture changes to run auth before our middleware).
 *   2. Direct Bearer-token lookup via Strapi's api-token service — the
 *      production path at the global middleware level.
 */
function buildRequireAuthAuthorize(
  strapi: Core.Strapi,
  requireAuth: RequireAuthOption,
): (ctx: AuthGateContext) => Promise<boolean> {
  return async (ctx: AuthGateContext) => {
    // Fast path: auth already on context (future-proof).
    const strategyName = ctx.state?.auth?.strategy?.name;

    if (strategyName) {
      if (requireAuth === true) {
        return strategyName === "api-token" || strategyName === "admin";
      }

      return strategyName === requireAuth;
    }

    // Slow path: inspect the request directly.
    // Extract Bearer token and validate via Strapi's api-token service.
    const authorization = ctx.request.header["authorization"];
    const authHeader = Array.isArray(authorization)
      ? authorization[0]
      : authorization;

    if (!authHeader) return false;

    const parts = authHeader.split(/\s+/);

    if (parts[0]?.toLowerCase() !== "bearer" || parts.length !== 2) {
      return false;
    }

    const rawToken = parts[1];

    if (requireAuth === "admin") {
      // At the global Koa level, admin JWTs and API tokens are
      // indistinguishable without decoding the Bearer payload. The
      // fast path above (ctx.state.auth.strategy.name) handles admin
      // when auth has run; here we conservatively deny.
      return false;
    }

    // requireAuth is true or "api-token" — validate the api token.
    try {
      const apiTokenService = strapi.service("admin::api-token") as {
        getBy: (q: Record<string, unknown>) => Promise<{
          expiresAt?: string | Date | null;
        } | null>;
        hash: (t: string) => string;
      };

      const apiToken = await apiTokenService.getBy({
        accessKey: apiTokenService.hash(rawToken),
      });

      if (!apiToken) return false;

      // Match Strapi's own api-token strategy: reject expired tokens.
      if (
        apiToken.expiresAt != null &&
        new Date(apiToken.expiresAt) < new Date()
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  };
}
