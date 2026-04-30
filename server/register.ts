import type { Core } from "@strapi/strapi";
import { createApolloPlugin } from "./apollo-plugin";
import { createKoaMiddleware } from "./koa-middleware";
import type { PluginConfig } from "./config";
import { buildRequireAuthAuthorize } from "./require-auth-authorize";

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
          authorize: buildRequireAuthAuthorize(
            strapi,
            pluginConfig.requireAuth,
          ),
        }
      : pluginConfig;

  const middleware = createKoaMiddleware({ config, apiPrefix });

  // strapi.server.app is a Koa app; .use prepends to the middleware stack.
  // Registering here means our middleware runs before route handlers but
  // after Strapi's own request-parsing chain.
  (strapi.server.app as { use: (mw: unknown) => void }).use(middleware);
}
