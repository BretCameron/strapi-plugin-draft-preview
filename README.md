# Strapi Plugin: Draft Preview

[![CI](https://github.com/BretCameron/strapi-plugin-draft-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/BretCameron/strapi-plugin-draft-preview/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/strapi-plugin-draft-preview.svg)](https://www.npmjs.com/package/strapi-plugin-draft-preview)
[![npm downloads](https://img.shields.io/npm/dm/strapi-plugin-draft-preview.svg)](https://www.npmjs.com/package/strapi-plugin-draft-preview)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Preview unpublished Strapi content from your frontend with a single HTTP header.**

Drop in this plugin, send `x-include-drafts: true` from your preview environment, and every REST or GraphQL request returns draft content, including nested relations.

No per-query rewrites, no parallel staging schemas. Works the same way over both APIs.

## Why you'd want this

This plugin gives you two things:

**1. Draft preview** — send `x-include-drafts: true` from your preview environment, and every REST or GraphQL request returns draft content, including nested relations. No per-query rewrites, no parallel staging schemas.

**2. Draft leak prevention** — Strapi's default permission model treats drafts and published content as a single `find` permission. Anyone with read access can fetch drafts via `?status=draft` (REST) or `status: DRAFT` (GraphQL). For products where draft leakage matters — early announcements, embargoed content, unreleased features — this plugin's auth gate plus `guardNativeStatus: true` is the missing piece.

```js
// config/plugins.js
module.exports = {
  "draft-preview": { enabled: true },
};
```

Common use cases:

- Showing drafts in staging; hiding them in production.
- Showing drafts to admin users or specific API tokens; hiding them for everyone else.
- Preventing public draft access via the native `?status=draft` path.

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

- **REST**: every `GET /api/...` request returns drafts when the header is set. Works with `populate=*` so relations come through.
- **GraphQL**: drafts from every built-in resolver (list, single, `*_connection`), with populated relations.
- Custom resolvers and non-draft content types are left alone.
- Explicit intent wins: a query passing `status: PUBLISHED` (GraphQL) or `?status=published` (REST) ignores the header.

## Security

The header is a _request_ to honour, not a _demand_. Whether the plugin honours it is decided by the auth gate, in this priority order:

1. **`authorize`** — your custom predicate. If you set it, its return value is the answer.
2. **`requireAuth`** — built-in check. `true` allows callers authenticated via API token. String forms (`"api-token"`) pin to one strategy.
3. **Env gate (default)** — denies in `NODE_ENV=production`, allows otherwise.

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

Bake an API token into your preview frontend and send it with `Authorization: Bearer <token>` plus the preview header. Anyone without the token gets published — including via `?status=draft`.

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

For richer rules (IP reputation, rate limits, geo) use your CDN or WAF — they handle proxy chains and observability properly.

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

      // Auth gate (new in v2) — priority order:
      authorize: (ctx) => ctx.state.user?.role?.name === "Editor", // 1
      requireAuth: true, // 2 — alternatively "api-token" or "admin"
      // 3 (default): denies in NODE_ENV=production

      // Optional — close the ?status=draft / status: DRAFT bypass
      guardNativeStatus: true, // default: false
    },
  },
};
```

All keys are optional. Set only what you need.

## Verify it works

Same request, two responses, different rows for draft vs published. REST:

```sh
# Without header — published mode
curl -s 'http://localhost:1337/api/articles/<documentId>?populate=category'

# With header — draft mode
curl -s -H 'x-include-drafts: true' \
  'http://localhost:1337/api/articles/<documentId>?populate=category'
```

GraphQL:

```sh
# Without header — published mode
curl -s 'http://localhost:1337/graphql' \
  -X POST -H 'Content-Type: application/json' \
  --data-raw '{"query":"{ articles(pagination: {limit: 1}) { documentId publishedAt category { documentId name } } }"}'

# With header — draft mode
curl -s 'http://localhost:1337/graphql' \
  -X POST -H 'Content-Type: application/json' -H 'x-include-drafts: true' \
  --data-raw '{"query":"{ articles(pagination: {limit: 1}) { documentId publishedAt category { documentId name } } }"}'
```

In draft mode `publishedAt` is `null` and `category` reflects the latest unpublished edits.

## How it works

### REST

A Koa middleware reads the header on content-API requests and sets `ctx.query.status = "draft"` before the controller runs. Strapi's REST controllers cascade `status` to relation populates by default, so nothing else is needed for the basic header path.

The middleware is injected per-route at plugin register time (into every content-API route's `config.middlewares`), which means it runs _after_ Strapi's `authenticate` strategy in the route pipeline. By the time the middleware runs, `ctx.state.auth.strategy.name` is populated, so `requireAuth` reads it directly — no Bearer-token re-validation needed.

### GraphQL

Strapi's GraphQL plugin registers an Apollo `willResolveField` hook that captures `contextValue.rootQueryArgs` from the root query's args. The association resolver for relations reads `rootQueryArgs.status` to decide which side of the draft/published split to populate from. A `resolversConfig` middleware mutates args _after_ that snapshot, so its mutation never reaches relation populates — every relation comes back as `null` in draft mode.

This plugin hooks the same `willResolveField` lifecycle, mutating both `args.status` and `rootQueryArgs.status` so populates inherit the right status. Robust to Apollo plugin ordering changes across Strapi versions.

GraphQL resolvers run inside route handlers (after `authenticate`), so the GraphQL path also reads `ctx.state.auth.strategy.name` directly. The configuration surface is identical for either transport.

### Custom routes

The plugin walks `strapi.apis` and `strapi.plugins` to inject its middleware into every content-API route — covering the conventional `src/api/` layout and most plugin routes. Routes hand-rolled outside that convention (e.g. via `strapi.server.routes(...)` from your own `bootstrap`) won't be touched.

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

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the changeset workflow.

## Licence

MIT
