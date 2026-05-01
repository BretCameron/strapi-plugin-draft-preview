# strapi-plugin-draft-preview

## 2.0.0

### Major Changes

- 30fe634: Auth gate (production-safe defaults). The preview header is ignored in production unless `authorize`, `requireAuth`, or non-`production` `NODE_ENV` says otherwise. New `guardNativeStatus` flag closes the `?status=draft` and `status: DRAFT` bypass — turning the plugin into a draft leak prevention tool, not just a preview helper.

  ### What's new
  - `authorize?: (ctx) => boolean | Promise<boolean>` — custom predicate; if set, its return value is the gate's decision.
  - `requireAuth?: true | "api-token" | "admin"` — built-in check. `true` allows API tokens or admin JWTs.
  - `guardNativeStatus?: boolean` — when set, denied requests using `?status=draft` (REST) or `status: DRAFT` (GraphQL) get rewritten to `published` instead of leaking drafts via Strapi's native paths.
  - Boot-time `strapi.log.warn` when running in production with no gate configured.

  ### Migrating from 1.x
  1. Decide which use case applies: staging-only, admin-only-in-prod, or custom logic.
  2. Pick a config snippet from the README "Security" section.
  3. If you genuinely want v1.0.0 behaviour, set `authorize: () => true` — explicit and auditable.

  ### Architectural note

  The REST Koa middleware runs at the global app level — _before_ Strapi's per-route `authenticate` strategy populates `ctx.state.auth`. To honour `requireAuth` correctly, the plugin extracts the Bearer token, hashes it, and looks it up via Strapi's `admin::api-token` service. This mirrors Strapi's own api-token strategy (including expiry checks) and fails closed on every error path. The GraphQL path runs after auth and uses the simpler `ctx.state.auth.strategy.name` lookup. Configuration surface is identical for either transport.

## 1.0.0

### Major Changes

- f4dd811: Rename: published as `strapi-plugin-draft-preview`. The Strapi plugin key is now `"draft-preview"` instead of `"include-drafts"` in `config/plugins.js`. The HTTP header default stays `x-include-drafts` (it describes the request semantic, independent of package name).

  Migrating from prior installs (only relevant if you used a pre-release):
  - Update `npm install`'d package: `npm uninstall strapi-plugin-include-drafts && npm install strapi-plugin-draft-preview`
  - Update `config/plugins.js`: `"include-drafts"` → `"draft-preview"`

### Minor Changes

- f3d9c16: Initial release. Strapi v5 plugin that injects `status: "draft"` into GraphQL queries when an HTTP header is set, working around the `rootQueryArgs` populate quirk that breaks resolversConfig middleware approaches.
  - Apollo Server plugin instead of resolversConfig middleware so the status reaches relation populates.
  - Configurable header name, expected value, and status string.
  - Honours an explicit `status` argument from the query AST.
  - Skips fields without a `status` arg, so custom resolvers and non-draft-and-publish content types are untouched.

- 7c73ff2: Add REST API support. The same `x-include-drafts` header now works on both REST (`GET /api/...`) and GraphQL endpoints. A Koa middleware injects `status=draft` into the request's query string for any request under the configured API prefix when the header is set, leaving Admin and GraphQL routes untouched.

### Patch Changes

- 24e0627: Internal: integration tests no longer fail CI on a benign Strapi destroy-time error. The plugin runtime is unaffected.
- e607c84: Docs: clearer README with stronger framing and use case, package.json description and keywords broadened for npm search discoverability.
