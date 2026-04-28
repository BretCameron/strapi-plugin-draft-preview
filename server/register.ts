import type { Core } from "@strapi/strapi";
import { createApolloPlugin } from "./apollo-plugin";
import type { PluginConfig } from "./config";

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const graphql = strapi.plugin("graphql");

  if (!graphql) {
    strapi.log.warn(
      "[strapi-plugin-include-drafts] @strapi/plugin-graphql is not installed; " +
        "plugin will be a no-op. Install and enable it to use this plugin.",
    );
    return;
  }

  const pluginConfig = strapi.config.get<PluginConfig>(
    "plugin::include-drafts",
  );

  const apolloPlugin = createApolloPlugin(pluginConfig);

  // Append to the GraphQL plugin's apolloServer.plugins array. The Strapi
  // GraphQL plugin merges this into the Apollo Server config at boot.
  const existing =
    strapi.config.get<unknown[]>("plugin::graphql.apolloServer.plugins") ?? [];

  strapi.config.set("plugin::graphql.apolloServer.plugins", [
    ...existing,
    apolloPlugin,
  ]);
};
