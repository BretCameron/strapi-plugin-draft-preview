# Strapi Plugin: Draft Preview

[![CI](https://github.com/BretCameron/strapi-plugin-draft-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/BretCameron/strapi-plugin-draft-preview/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/strapi-plugin-draft-preview.svg)](https://www.npmjs.com/package/strapi-plugin-draft-preview)
[![npm downloads](https://img.shields.io/npm/dm/strapi-plugin-draft-preview.svg)](https://www.npmjs.com/package/strapi-plugin-draft-preview)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Strapi's draft model gives you draft rows in the database. It doesn't give you a way to switch a frontend into draft mode, and it doesn't give you a way to gate who can read drafts at all. This plugin does both.**

## Why you'd want this

Strapi solves storing draft and published versions side by side. The two things it leaves to you are exactly the things this plugin handles.

**Switching mode is per-query.** Every request decides between draft and published via a `?status=draft` parameter (REST) or `status: DRAFT` argument (GraphQL). To flip a whole frontend, environment, or user type into draft mode, you'd thread that argument through every query yourself, or maintain a parallel data layer. This plugin lets you flip with a single header that the server respects across REST and GraphQL, populated relations included. Set it once on your preview client and forget it.

**Permissions don't cover drafts.** Strapi's `find` permission grants access to drafts and published content interchangeably. There's no built-in "this caller can read published but not drafts." If draft leakage matters (embargoed announcements, unreleased features, content under legal review), you've had nothing to reach for. The plugin's `authorize` / `requireAuth` flags plus `guardNativeStatus: true` close that gap: drafts stay private until the gate says otherwise, even on the native `?status=draft` path.

```js
// config/plugins.js
module.exports = {
  "draft-preview": { enabled: true },
};
```

Common use cases:

- Drafts in staging, published in production.
- Drafts for admin users or specific API tokens, published for everyone else.
- Public draft access via `?status=draft` blocked entirely.

## Install

```sh
npm install strapi-plugin-draft-preview
```

```js
// config/plugins.js
module.exports = {
  "draft-preview": { enabled: true },
};
```

Then send `x-include-drafts: true` from your frontend in non-production environments. Apollo Client example:

```ts
const draftHeaderLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    ...(process.env.NODE_ENV !== "production" && {
      "x-include-drafts": "true",
    }),
  },
}));
```

## What you get

Every REST `GET /api/...` and every built-in GraphQL resolver (list, single, `*_connection`) returns drafts when the header is set, populated relations included. Custom resolvers and non-draft content types are left alone. An explicit `status: PUBLISHED` (GraphQL) or `?status=published` (REST) always wins; the header is a default, not an override.

## Security

The header is advisory. Whether the plugin honours it is decided by the auth gate, in this priority order:

1. `authorize`: your custom predicate. If you set it, its return value is the answer.
2. `requireAuth`: built-in check. `true` allows callers authenticated via API token. String forms (`"api-token"`, `"admin"`) pin to one strategy.
3. Env gate (default): denies in `NODE_ENV=production`, allows otherwise.

| Caller                                               | `?status=draft` (native)    | `x-include-drafts` header   |
| ---------------------------------------------------- | --------------------------- | --------------------------- |
| Allowed by gate                                      | drafts                      | drafts                      |
| Denied by gate, `guardNativeStatus: false` (default) | drafts (Strapi serves them) | silent fallback → published |
| Denied by gate, `guardNativeStatus: true`            | rewritten → published       | silent fallback → published |

### Use case 1: staging only, prod hidden

Default behaviour. Ship the plugin, set `NODE_ENV=production` on prod, and the header is automatically ignored there.

### Use case 2: admin-only previews in production

```js
"draft-preview": {
  enabled: true,
  config: { requireAuth: true, guardNativeStatus: true },
},
```

Bake an API token into your preview frontend, send it with `Authorization: Bearer <token>` plus the preview header. Anyone without the token gets published, including via `?status=draft`.

### Use case 3: per-environment isolation

Issue separate API tokens per environment, allow-list them by name:

```js
authorize: (ctx) =>
  ["preview-uat", "preview-develop"].includes(
    ctx.state.auth?.credentials?.name,
  ),
```

A leaked token in one environment is recoverable by rotating just that token.

### IP allow-listing, geo-fencing, etc.

Express it from `authorize`:

```js
authorize: (ctx) => allowedIps.includes(ctx.ip),
```

For richer rules (IP reputation, rate limits, geo) use your CDN or WAF. They handle proxy chains and observability properly.

### Keeping v1.0.0 behaviour

If you genuinely want the header to be public:

```js
authorize: () => true,
```

This is rarely the right choice. It's offered explicitly so the bypass is auditable.

## Configuration (all optional)

```js
module.exports = {
  "draft-preview": {
    enabled: true,
    config: {
      // Header behaviour
      headerName: "x-strapi-preview", // default: "x-include-drafts"
      expectedHeaderValue: "1", // default: "true"
      statusValue: "draft", // default: "draft"

      // Auth gate (new in v2), priority order:
      authorize: (ctx) => ctx.state.user?.role?.name === "Editor", // 1
      requireAuth: true, // 2: alternatively "api-token" or "admin"
      // 3 (default): denies in NODE_ENV=production

      // Optional: close the ?status=draft / status: DRAFT bypass
      guardNativeStatus: true, // default: false
    },
  },
};
```

All keys are optional. Set only what you need.

## Verify it works

Same request, two responses, different rows for draft vs published. REST:

```sh
# Without header: published mode
curl -s 'http://localhost:1337/api/articles/<documentId>?populate=category'

# With header: draft mode
curl -s -H 'x-include-drafts: true' \
  'http://localhost:1337/api/articles/<documentId>?populate=category'
```

GraphQL:

```sh
# Without header: published mode
curl -s 'http://localhost:1337/graphql' \
  -X POST -H 'Content-Type: application/json' \
  --data-raw '{"query":"{ articles(pagination: {limit: 1}) { documentId publishedAt category { documentId name } } }"}'

# With header: draft mode
curl -s 'http://localhost:1337/graphql' \
  -X POST -H 'Content-Type: application/json' -H 'x-include-drafts: true' \
  --data-raw '{"query":"{ articles(pagination: {limit: 1}) { documentId publishedAt category { documentId name } } }"}'
```

In draft mode `publishedAt` is `null` and `category` reflects the latest unpublished edits.

## How it works

### REST

A Koa middleware reads the header on content-API requests and sets `ctx.query.status = "draft"` before the controller runs. Strapi's REST controllers cascade `status` to relation populates by default, so nothing else is needed for the basic header path.

The middleware is injected per-route at plugin register time (into every content-API route's `config.middlewares`), which means it runs _after_ Strapi's `authenticate` strategy in the route pipeline. By the time the middleware runs, `ctx.state.auth.strategy.name` is populated, so `requireAuth` reads it directly. No Bearer-token re-validation needed.

### GraphQL

Strapi's GraphQL plugin registers an Apollo `willResolveField` hook that captures `contextValue.rootQueryArgs` from the root query's args. The association resolver for relations reads `rootQueryArgs.status` to decide which side of the draft/published split to populate from. A `resolversConfig` middleware mutates args _after_ that snapshot, so its mutation never reaches relation populates: every relation comes back as `null` in draft mode.

This plugin hooks the same `willResolveField` lifecycle, mutating both `args.status` and `rootQueryArgs.status` so populates inherit the right status. Robust to Apollo plugin ordering changes across Strapi versions.

GraphQL resolvers run inside route handlers (after `authenticate`), so the GraphQL path also reads `ctx.state.auth.strategy.name` directly. The configuration surface is identical for either transport.

### Custom routes

The plugin walks `strapi.apis` and `strapi.plugins` to inject its middleware into every content-API route, covering the conventional `src/api/` layout and most plugin routes. Routes hand-rolled outside that convention (e.g. via `strapi.server.routes(...)` from your own `bootstrap`) won't be touched.

If you have such a route and want the gate to apply to it, import the middleware factory and add it to the route's `config.middlewares`:

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

The factory reads the plugin's configured `headerName`, `statusValue`, `authorize`, `requireAuth`, and `guardNativeStatus` from `strapi.config.get('plugin::draft-preview')`, so the gate behaves identically to the auto-injected middleware.

## Compatibility

- Strapi `5.x`
- Node `20`, `22`, `24`

CI runs against multiple Strapi 5.x versions to catch upgrade-time contract breaks.

## Upgrading from v1

v2 adds an auth gate. The preview header is no longer free-for-all: in `NODE_ENV=production` it's denied by default, and you opt in via `requireAuth` or `authorize`. v2 also adds `guardNativeStatus: true`, which closes the `?status=draft` / `status: DRAFT` bypass for callers who don't pass the gate.

Three migration paths, depending on what you used v1 for.

**Staging or dev only.** No config change required. The env gate denies the header in `NODE_ENV=production`; in any other environment it allows. If you boot a v2 plugin in production without configuring `authorize` or `requireAuth`, the plugin logs a one-line `strapi.log.warn` on boot reminding you to configure a gate or to set `authorize: () => true` explicitly.

**Admin or token-gated previews in production.** Add `requireAuth: true` so the header only works for callers authenticated via API token or admin JWT. Add `guardNativeStatus: true` to also block the native `?status=draft` path for callers without auth.

```js
"draft-preview": {
  enabled: true,
  config: { requireAuth: true, guardNativeStatus: true },
},
```

**Keep v1 behaviour.** Set `authorize: () => true`. The header is honoured for everyone, same as before. This is rarely the right call, but it's offered as an explicit option so the bypass is auditable from config.

```js
"draft-preview": {
  enabled: true,
  config: { authorize: () => true },
},
```

The full configuration surface is documented in [Configuration](#configuration-all-optional); the trust model and worked examples are in [Security](#security).

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the changeset workflow.

## Licence

MIT
