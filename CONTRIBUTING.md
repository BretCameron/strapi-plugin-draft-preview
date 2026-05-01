# Contributing

Thanks for taking an interest. This is a small plugin so the loop is short.

## Local setup

```sh
git clone https://github.com/BretCameron/strapi-plugin-draft-preview
cd strapi-plugin-draft-preview
npm install
```

## Tests

Two tiers — both run in CI.

```sh
npm run test:unit         # fast, isolated, ~300ms
npm run test:integration  # boots a real Strapi, ~3s
npm run test:coverage     # unit tests with coverage threshold (90%)
```

Integration tests live under `tests/integration/` and boot a minimal Strapi app from `tests/integration/test-app/`. The plugin itself is symlinked into `node_modules/` so Strapi's loader can find it via npm-style resolution — `npm run link-self` handles this and is run automatically by `test:integration`.

## Lint and format

```sh
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

CI runs both on every PR.

## Releases

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing.

When you make a user-facing change:

```sh
npx changeset
```

Pick the bump (patch / minor / major) and write a one-paragraph release note. Commit the generated `.changeset/*.md` alongside your code.

When the PR merges to `main`, the release workflow opens (or updates) a "Version Packages" PR. Merging _that_ PR publishes to npm.

Chore-only or docs-only changes don't need a changeset.

## How it works

### REST

A Koa middleware reads the header on content-API requests and sets `ctx.query.status = "draft"` before the controller runs. Strapi's REST controllers cascade `status` to relation populates by default, so populated relations come through correctly without further work.

The middleware is injected per-route at the `strapi::content-types.afterSync` hook, which fires after every plugin's register has completed but before `server.initRouting()` composes routes. The plugin walks `strapi.apis` and `strapi.plugins` and appends the middleware to each content-API route's `config.middlewares`. Strapi's per-route pipeline then composes:

```
[ routeInfo → authenticate → authorize → policies → draft-preview → action ]
```

So the middleware runs after `authenticate`, with `ctx.state.auth.strategy.name` already populated. `requireAuth` reads it directly through Strapi's actual auth pipeline, with no Bearer-token re-validation.

The `afterSync` deferral matters because reading `router.routes` triggers a lazy getter on `createCoreRouter` that resolves custom fields. Doing that during the register lifecycle would break in any project where another plugin registers a custom field used by content-type routes (a local wysiwyg plugin, for example).

### GraphQL

Strapi's GraphQL plugin registers an Apollo `willResolveField` hook that captures `contextValue.rootQueryArgs` from the root query's args. The association resolver for relations reads `rootQueryArgs.status` to decide which side of the draft/published split to populate from. Strapi's own `resolversConfig` middleware mutates args _after_ that snapshot, so the mutation never reaches relation populates: every relation comes back as `null` in draft mode.

This plugin hooks the same `willResolveField` lifecycle, mutating both `args.status` and `rootQueryArgs.status` so populates inherit the right status. Stable across Strapi versions even if Apollo plugin order changes.

The plugin's `willResolveField` is synchronous. Apollo's `invokeSyncDidStartHook` does not await plugin returns; an async `willResolveField` returns a `Promise<void>` that Apollo treats as a `didEndHook` callback and tries to invoke as a function, throwing `TypeError: didEndHook is not a function`. The gate decision (the only async work needed) is precomputed once per request in `executionDidStart` (which Apollo does await), cached in closure, and read synchronously by `willResolveField`.

Because GraphQL resolvers run inside route handlers (after `authenticate`), the GraphQL path also reads `ctx.state.auth.strategy.name` directly. The configuration surface is identical for either transport.

### Custom routes

The per-route injection covers the conventional `src/api/` layout and most plugin routes (anything in `strapi.apis` or `strapi.plugins`). Routes hand-rolled outside that convention, e.g. via `strapi.server.routes(...)` from a `bootstrap` hook, won't be touched.

For those routes, the plugin exports a middleware factory:

```ts
import { createDraftPreviewMiddleware } from "strapi-plugin-draft-preview/middleware";

// In your custom route's config:
{
  method: "GET",
  path: "/my-custom",
  handler: "myController.action",
  config: {
    middlewares: [createDraftPreviewMiddleware({ strapi })],
  },
}
```

The factory reads the plugin's configuration from `strapi.config.get('plugin::draft-preview')`, so the gate behaves identically to the auto-injected middleware.

## What "watertight" means here

The plugin is small but takes load-bearing dependencies on Strapi internals (the GraphQL `rootQueryArgs` snapshot, the association resolver inheritance pattern, and the REST controller's `status` query handling). Three layers of tests guard against breakage:

1. **Unit tests** (`server/__tests__/`) cover the pure decision logic for both the Apollo plugin and the Koa middleware — what each does given hypothetical inputs.
2. **Contract tests** (`server/__tests__/strapi-contract.test.ts`) read the installed `@strapi/plugin-graphql` source and assert the symbols we depend on still exist. Catches breaking upgrades cheaply.
3. **Integration tests** (`tests/integration/`) boot a real Strapi, seed draft+published content, and hit both `/graphql` and `/api/*` REST endpoints with and without the header. They assert the responses actually change the way we expect on both transports.

CI runs the integration suite against multiple Strapi versions in matrix.

If you're adding a new behaviour, please cover it at all three levels where applicable.
