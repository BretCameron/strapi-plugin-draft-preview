---
"strapi-plugin-draft-preview": major
---

Auth gate (production-safe defaults). The preview header is ignored in production unless `authorize`, `requireAuth`, or non-`production` `NODE_ENV` says otherwise. New `guardNativeStatus` flag closes the `?status=draft` and `status: DRAFT` bypass — turning the plugin into a draft leak prevention tool, not just a preview helper.

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

The REST Koa middleware runs at the global app level — *before* Strapi's per-route `authenticate` strategy populates `ctx.state.auth`. To honour `requireAuth` correctly, the plugin extracts the Bearer token, hashes it, and looks it up via Strapi's `admin::api-token` service. This mirrors Strapi's own api-token strategy (including expiry checks) and fails closed on every error path. The GraphQL path runs after auth and uses the simpler `ctx.state.auth.strategy.name` lookup. Configuration surface is identical for either transport.
