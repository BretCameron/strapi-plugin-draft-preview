import type { Core } from "@strapi/strapi";
import { createApolloPlugin } from "./apollo-plugin";
import { createKoaMiddleware } from "./koa-middleware";
import type { PluginConfig } from "./config";

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
  const middleware = createKoaMiddleware({
    config: pluginConfig,
    apiPrefix,
  }) as RouteMiddleware;

  // Inject our middleware into every content-API route. Strapi composes
  // routes during bootstrap → server.initRouting(); the composed pipeline is:
  //   [routeInfo, authenticate, authorize, policies, ...routeMiddlewares,
  //    returnBody, ...action]
  // so our middleware lands AFTER `authenticate` and sees a fully populated
  // `ctx.state.auth`. This avoids the global-app-middleware layer (which
  // runs before authenticate) and lets `runGate` rely on standard auth
  // strategy detection rather than re-implementing token lookup.
  //
  // We defer iteration to the `strapi::content-types.afterSync` hook
  // (runs AFTER every plugin's register has completed but BEFORE
  // initRouting) because reading `router.routes` triggers a lazy getter
  // on `createCoreRouter` that resolves custom fields. Resolving custom
  // fields at register time would fail if any other plugin hasn't yet
  // registered its custom fields (e.g. a local wysiwyg plugin).
  // Strapi's `hook(name)` is typed as `any` upstream; narrow at the call
  // site so we don't propagate `any` through our code.
  const afterSync = strapi.hook("strapi::content-types.afterSync") as {
    register: (handler: () => void) => void;
  };
  afterSync.register(() => injectIntoContentApiRoutes(strapi, middleware));
}

interface RouteLike {
  config?: { middlewares?: unknown[] } & Record<string, unknown>;
}

interface RouterLike {
  type?: string;
  routes?: RouteLike[];
}

type RouteMiddleware = (ctx: never, next: () => Promise<void>) => Promise<void>;

function injectIntoContentApiRoutes(
  strapi: Core.Strapi,
  middleware: RouteMiddleware,
) {
  const visitRouter = (router: RouterLike) => {
    if (router.type !== "content-api") return;
    if (!Array.isArray(router.routes)) return;
    for (const route of router.routes) {
      route.config = route.config ?? {};
      route.config.middlewares = [
        ...(route.config.middlewares ?? []),
        middleware,
      ];
    }
  };

  // User APIs: src/api/<name>/routes/* — shape `{ [routerKey]: router }`.
  for (const apiName of Object.keys(strapi.apis ?? {})) {
    const api = strapi.apis[apiName] as { routes?: Record<string, RouterLike> };
    for (const router of Object.values(api.routes ?? {})) {
      visitRouter(router);
    }
  }

  // Plugins: shape varies. Some return `{ [namespace]: router }` (e.g.
  // users-permissions), others a flat array (legacy). Iterate both.
  for (const pluginName of Object.keys(strapi.plugins ?? {})) {
    const plugin = strapi.plugins[pluginName] as {
      routes?: Record<string, RouterLike> | RouteLike[];
    };
    const routes = plugin.routes;
    if (Array.isArray(routes)) continue; // Flat plugin routes are admin by default.
    if (!routes || typeof routes !== "object") continue;
    for (const router of Object.values(routes)) {
      visitRouter(router);
    }
  }
}
