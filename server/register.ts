import type { Core } from "@strapi/strapi";
import { createApolloPlugin } from "./apollo-plugin";
import { createKoaMiddleware } from "./koa-middleware";
import type { PluginConfig } from "./config";

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const pluginConfig = strapi.config.get<PluginConfig>(
    "plugin::draft-preview",
  );

  registerGraphqlSupport(strapi, pluginConfig);
  registerRestSupport(strapi, pluginConfig);
};

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

  const middleware = createKoaMiddleware({ config: pluginConfig, apiPrefix });

  // strapi.server.app is a Koa app; .use prepends to the middleware stack.
  // Registering here means our middleware runs before route handlers but
  // after Strapi's own request-parsing chain.
  (strapi.server.app as { use: (mw: unknown) => void }).use(middleware);
}
