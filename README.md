# strapi-plugin-include-drafts

[![CI](https://github.com/BretCameron/strapi-plugin-include-drafts/actions/workflows/ci.yml/badge.svg)](https://github.com/BretCameron/strapi-plugin-include-drafts/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/strapi-plugin-include-drafts.svg)](https://www.npmjs.com/package/strapi-plugin-include-drafts)
[![npm downloads](https://img.shields.io/npm/dm/strapi-plugin-include-drafts.svg)](https://www.npmjs.com/package/strapi-plugin-include-drafts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Preview unpublished Strapi content from your frontend with a single HTTP header.**

Drop in this plugin, send `x-include-drafts: true` from your preview environment, and every REST or GraphQL request returns draft content, including nested relations.

No per-query rewrites, no parallel staging schemas. Works the same way over both APIs.

## Why you'd want this

This plugin makes draft preview a one-line config change:

```js
// config/plugins.js
module.exports = {
  "include-drafts": { enabled: true },
};
```

Now you can send one header and gets drafts back. Use-cases include:

- Showing drafts in staging; hiding them in production.
- Showing drafts to admin users; hiding them for everyone else.

## Install

```sh
npm install strapi-plugin-include-drafts
```

```js
// config/plugins.js
module.exports = {
  "include-drafts": { enabled: true },
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

## Configuration (all optional)

```js
module.exports = {
  "include-drafts": {
    enabled: true,
    config: {
      headerName: "x-strapi-preview", // default: "x-include-drafts"
      expectedHeaderValue: "1", // default: "true"
      statusValue: "draft", // default: "draft"
    },
  },
};
```

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

**REST** is the simple half: a Koa middleware reads the header on `/api/*` requests and sets `ctx.query.status = "draft"` before the controller runs. Strapi's REST controllers cascade `status` to relation populates by default, so nothing else is needed.

**GraphQL** is more involved. Strapi's GraphQL plugin registers an Apollo `willResolveField` hook that captures `contextValue.rootQueryArgs` from the root query's args. The association resolver for relations reads `rootQueryArgs.status` to decide which side of the draft/published split to populate from. A `resolversConfig` middleware mutates args _after_ that snapshot, so its mutation never reaches relation populates — every relation comes back as `null` in draft mode. This plugin hooks the same `willResolveField` lifecycle, mutating both `args.status` and `rootQueryArgs.status` so populates inherit the right status. Robust to Apollo plugin ordering changes across Strapi versions.

## Compatibility

- Strapi `5.x`
- Node `20`, `22`, `24`

CI runs against multiple Strapi 5.x versions to catch upgrade-time contract breaks.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the changeset workflow.

## Licence

MIT
