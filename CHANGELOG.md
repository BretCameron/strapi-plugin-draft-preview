# strapi-plugin-draft-preview

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
