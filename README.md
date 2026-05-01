# Strapi Plugin: Draft Preview

[![CI](https://github.com/BretCameron/strapi-plugin-draft-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/BretCameron/strapi-plugin-draft-preview/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/strapi-plugin-draft-preview.svg)](https://www.npmjs.com/package/strapi-plugin-draft-preview)
[![npm downloads](https://img.shields.io/npm/dm/strapi-plugin-draft-preview.svg)](https://www.npmjs.com/package/strapi-plugin-draft-preview)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Preview unpublished Strapi content from your frontend with a single HTTP header, securely.**

## Why you'd want this

By default, Strapi's draft mode:

- Requires you to manually request the draft `status` for every query.
- Is tied to the same `find` permission as published content. If draft leakage matters, Strapi's built-in system can't help.

This plugin solves both issues.

Common use cases:

- Drafts in staging, published in production.
- Drafts for admin users or specific API tokens, published for everyone else.
- Public draft access via `?status=draft` blocked entirely.

## Install

```sh
npm install strapi-plugin-draft-preview
```

Enable the plugin in `config/plugins.js`:

```js
module.exports = {
  "draft-preview": { enabled: true },
};
```

Then send `x-include-drafts: true` from your frontend. Apollo Client example:

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

Now, outside of production, all queries will return drafts!

## Security

Whether the plugin honours the header is decided by the auth gate, in this order of priority:

1. `authorize`: a custom callback. If you set it, it decides.
2. `requireAuth`: built-in check. `true` allows callers authenticated via API token. String forms (`"api-token"`, `"admin"`) pin to one strategy.
3. NODE_ENV env gate (default): the header is honoured outside production, denied in production. Override via `authorize` or `requireAuth`.

| Caller                                               | `?status=draft` (native)    | `x-include-drafts` header |
| ---------------------------------------------------- | --------------------------- | ------------------------- |
| Allowed by gate                                      | drafts                      | drafts                    |
| Denied by gate, `guardNativeStatus: false` (default) | drafts (Strapi serves them) | published                 |
| Denied by gate, `guardNativeStatus: true`            | published                   | published                 |

### Use case 1: staging only, prod hidden (separate Strapi instances)

If you run separate Strapi instances per environment (one for staging, one for production), this is the default behaviour: ship the plugin, set `NODE_ENV=production` on the prod instance, and the header is automatically ignored there.

If you run one Strapi instance serving multiple frontends (a shared CMS), use case 2 below is the right pattern instead. The env gate alone won't help: a single CMS in production would deny the header for every frontend, including staging.

### Use case 2: admin-only previews in production (single shared CMS)

```js
"draft-preview": {
  enabled: true,
  config: { requireAuth: true, guardNativeStatus: true },
},
```

Bake an API token into your preview frontend, send it with `Authorization: Bearer <token>` plus the preview header. Anyone without the token gets published, including via `?status=draft`.

This is also the right shape for one Strapi instance serving multiple frontend environments (prod, UAT, develop, etc.). The token decides who sees drafts, not `NODE_ENV`.

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

For richer rules (IP reputation, rate limits, geo) use your CDN or WAF.

### Full access

If you genuinely want the header to be public:

```js
authorize: () => true,
```

## Configuration (all optional)

| Key                   | Type                                      | Default              | Description                                                                                                                                                                        |
| --------------------- | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headerName`          | `string`                                  | `"x-include-drafts"` | HTTP header that flips a request into draft mode.                                                                                                                                  |
| `expectedHeaderValue` | `string`                                  | `"true"`             | Header value treated as truthy.                                                                                                                                                    |
| `statusValue`         | `string`                                  | `"draft"`            | Status string injected into queries when the gate allows.                                                                                                                          |
| `authorize`           | `(ctx) => boolean \| Promise<boolean>`    | (unset)              | Custom predicate. If set, its return value is the gate's decision. Thrown errors are treated as deny.                                                                              |
| `requireAuth`         | `true \| "api-token" \| "admin" \| false` | `false`              | Built-in check. `true` allows callers authenticated via API token or admin JWT; string forms pin to one strategy.                                                                  |
| `guardNativeStatus`   | `boolean`                                 | `false`              | When set, denied requests using the native `?status=draft` (REST) or `status: DRAFT` (GraphQL) paths are rewritten to `published`. Without this, the native paths bypass the gate. |

## Compatibility

- Strapi `5.x`
- Node `20`, `22`, `24`

## Upgrading from v1

Upgrading from v1? See [CHANGELOG.md](CHANGELOG.md) for the migration paths.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the changeset workflow.

## Licence

MIT
