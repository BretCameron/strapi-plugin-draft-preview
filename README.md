# strapi-plugin-include-drafts

A Strapi v5 plugin that lets clients fetch draft content over GraphQL by sending an HTTP header — no per-query `status: DRAFT` argument needed.

## Why this exists

Strapi v5 supports a `status` argument on every GraphQL query for draft-and-publish content types. The obvious way to flip every query to draft based on a header is a `resolversConfig` middleware — but that doesn't work for relations.

Strapi's GraphQL plugin captures `contextValue.rootQueryArgs` from the root query's args inside a `willResolveField` Apollo plugin. The association resolver reads `rootQueryArgs.status` to populate relations. A `resolversConfig` middleware runs *after* that snapshot is captured, so its `args.status` mutation never reaches relation populates — drafts come back with every relation as `null`.

This plugin hooks `willResolveField` directly, mutating both `args.status` and `rootQueryArgs.status`, so populates inherit the draft status as expected.

## Install

```sh
npm install strapi-plugin-include-drafts
# or
yarn add strapi-plugin-include-drafts
```

## Enable

In `config/plugins.js`:

```js
module.exports = {
  "include-drafts": {
    enabled: true,
  },
};
```

That's it. Any GraphQL request carrying `x-include-drafts: true` will now return drafts (with relations populated) for any built-in query that accepts a `status` arg.

## Configure (optional)

```js
module.exports = {
  "include-drafts": {
    enabled: true,
    config: {
      headerName: "x-strapi-preview",     // default: "x-include-drafts"
      expectedHeaderValue: "1",           // default: "true"
      statusValue: "draft",               // default: "draft"
    },
  },
};
```

## Behaviour

- **Only acts on root query fields.** Sub-fields and mutations are ignored.
- **Only acts on fields that accept a `status` arg.** Custom resolvers and content types without draft-and-publish are left alone.
- **Honours an explicit `status` argument from the query.** If a query writes `portalResources(status: PUBLISHED, ...)`, the user's intent wins regardless of the header. The check inspects the query AST, not `args.status` — Strapi's schema defaults `status` to `PUBLISHED`, so reading `args.status` gives a false positive.
- **Mutates both `args.status` and `rootQueryArgs.status`** so behaviour is robust to Apollo plugin ordering across Strapi versions.

## Verifying it works

With the plugin enabled, the same query should return different rows depending on the header:

```sh
# Without header — published mode
curl -s 'http://localhost:1337/graphql' \
  -X POST -H 'Content-Type: application/json' \
  --data-raw '{"query":"{ portalResources(pagination: {limit: 1}) { documentId publishedAt section { id name } } }"}'

# With header — draft mode
curl -s 'http://localhost:1337/graphql' \
  -X POST -H 'Content-Type: application/json' -H 'x-include-drafts: true' \
  --data-raw '{"query":"{ portalResources(pagination: {limit: 1}) { documentId publishedAt section { id name } } }"}'
```

Compare `publishedAt` and the `section.id` row id between the two responses — they should differ.

## Compatibility

- Strapi `5.x`
- Node `18`, `20`, `22`

## Development

```sh
npm install
npm test         # run tests once
npm run test:watch
npm run build    # compile to dist/
npm run typecheck
```

## Licence

MIT
