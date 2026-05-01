# Auth gate design — `strapi-plugin-draft-preview` v2.0.0

Date: 2026-04-30
Status: Approved (brainstorming)
Target release: 2.0.0

## Goal

Make the plugin safe to deploy to production by default, and turn it into a positive draft-leak-prevention tool — not just a preview helper. v1.0.0's "send the header, get drafts" behaviour becomes opt-in.

**Positioning:** Strapi's default permission model treats drafts and published content as a single `find` permission — anyone with read access can fetch drafts via `?status=draft` or `status: DRAFT`. For products where draft leakage matters (early announcements, embargoed content, unreleased features), Strapi gives you no built-in defence. This plugin fills that gap: with `requireAuth`/`authorize` to gate authorisation and `guardNativeStatus: true` to close the native-path bypass, drafts become genuinely private. Preview convenience is one of two value props; leak prevention is the other.

## In scope

- Auth gate that decides, per request, whether to honour the preview header.
- Three layered controls: custom `authorize` predicate, built-in `requireAuth` check, env-based default that denies in production.
- Optional `guardNativeStatus` flag extending the gate to native `?status=draft` (REST) and `status: DRAFT` (GraphQL).
- Boot-time warning when running in production with no gate configured.

## Out of scope

- Gating native `?status=draft` / `status: DRAFT` by default. Users opt in via `guardNativeStatus`.
- IP allow-listing, rate limiting, geo-fencing — expressible from `authorize`, owned by infra layer.
- Users-permissions JWTs as an auth signal — drafts are an editor concern, not an end-user concern.
- Telemetry / metrics — Strapi's own logging stack covers it.

## Configuration

```ts
{
  // Existing (unchanged)
  headerName: string;            // default: "x-include-drafts"
  expectedHeaderValue: string;   // default: "true"
  statusValue: string;           // default: "draft"

  // New — auth gate
  authorize?: (ctx) => boolean | Promise<boolean>;
  requireAuth?: true | "api-token" | "admin" | false;
  guardNativeStatus?: boolean;   // default: false
}
```

Priority order (first match wins):

1. `authorize` — async predicate. Return value is the decision. Thrown errors → deny.
2. `requireAuth` — built-in check.
   - `true` ≡ allow on `ctx.state.auth.strategy.name === "api-token"` OR `"admin"`.
   - `"api-token"` ≡ only api-token strategy.
   - `"admin"` ≡ only admin strategy.
   - `false`/unset → fall through.
3. Env gate — deny when `process.env.NODE_ENV === "production"`, allow otherwise.

Validators in `config.ts`:

- `authorize` must be a function if set.
- `requireAuth` must be `true`, `false`, `"api-token"`, or `"admin"`.
- `guardNativeStatus` must be boolean.
- Existing string validators for `headerName`, `expectedHeaderValue`, `statusValue` unchanged.

## Decision flow

```
applyDecision(ctx, config):

1. Detect signals:
   - headerRequestsDrafts = (ctx header[headerName] === expectedHeaderValue)
   - nativeRequestsDrafts =
       REST:    ctx.query.status === statusValue
       GraphQL: explicit status: DRAFT in fieldNodes (not Strapi's PUBLISHED default)

2. If neither signal set → return (no-op).

3. Run gate:
   - If config.authorize → await config.authorize(ctx); return that boolean.
   - Else if config.requireAuth → return checkBuiltInAuth(ctx, requireAuth).
   - Else → return process.env.NODE_ENV !== "production".

4. On allow:
   - headerRequestsDrafts → set ctx.query.status = statusValue (REST) /
                            args.status + rootQueryArgs.status = statusValue (GraphQL).
                            REST: only set if ctx.query.status is undefined; an
                            explicit ?status=published from the caller still wins.
   - nativeRequestsDrafts → leave alone (Strapi already serves drafts via its own path).

5. On deny:
   - headerRequestsDrafts → no-op (silent fallback; caller gets published).
   - nativeRequestsDrafts AND config.guardNativeStatus → rewrite to "published".
     - Note: literal "published", not config.statusValue (which is the *draft* token).
     - Strapi v5 hardcodes "published" as the non-draft status string.
   - nativeRequestsDrafts AND !guardNativeStatus → leave alone.
```

## Architecture

```
server/
├── apollo-plugin.ts        ← modified: call shared decision helpers
├── auth-gate.ts            ← NEW: detectSignals + runGate
├── config.ts               ← modified: new keys + validators
├── index.ts
├── koa-middleware.ts       ← modified: call shared decision helpers
├── register.ts             ← modified: boot-time warning
└── __tests__/
    ├── auth-gate.test.ts   ← NEW
    ├── apollo-plugin.test.ts ← updated
    ├── koa-middleware.test.ts ← updated
    └── register.test.ts    ← new or extended
```

`auth-gate.ts` exports:

```ts
export interface AuthGateContext {
  request: { header: Record<string, string | string[] | undefined> };
  state?: {
    auth?: {
      strategy?: { name?: string };
      credentials?: unknown;
    };
  };
}

export async function runGate(
  ctx: AuthGateContext,
  config: PluginConfig,
): Promise<boolean>;

export function checkBuiltInAuth(
  ctx: AuthGateContext,
  requireAuth: PluginConfig["requireAuth"],
): boolean;

export function detectRestSignals(
  ctx: {
    query: Record<string, unknown>;
    request: { header: Record<string, string | string[] | undefined> };
  },
  config: PluginConfig,
): { header: boolean; nativeRest: boolean };
```

GraphQL signal detection lives in `apollo-plugin.ts` because it needs `info.fieldNodes`. The shared module owns gate logic; call sites own signal detection appropriate to their transport.

Koa middleware becomes:

```ts
const { header, nativeRest } = detectRestSignals(ctx, config);
if (!header && !nativeRest) return next();

const allowed = await runGate(ctx, config);

if (allowed) {
  if (header && ctx.query.status === undefined) {
    ctx.query.status = config.statusValue;
  }
} else {
  if (nativeRest && config.guardNativeStatus) {
    ctx.query.status = "published";
  }
  // header on deny: silent fallback, no mutation.
}

return next();
```

Apollo plugin's `applyDraftStatus` mirrors the structure: detect signals from `contextValue.koaContext` + `info.fieldNodes`, call `runGate`, mutate `args.status` and `rootQueryArgs.status` accordingly.

## Logging & observability

**Boot-time warning (in `register.ts`):**

```
[draft-preview] running in production with no auth gate; preview header
will be ignored. Set 'authorize' or 'requireAuth' in plugin config, or
use 'authorize: () => true' to keep v1.0.0 behaviour.
```

Fires when `NODE_ENV === "production"` AND neither `authorize` nor `requireAuth` is set. Once per boot.

**Per-request debug** (off at info level, only visible at debug):

```
strapi.log.debug("[draft-preview] preview denied by <reason>");
```

Reasons: `"authorize"`, `"requireAuth"`, `"env-gate"`, `"native-draft-rewritten"`.

**No logging on allow.** Avoids happy-path noise.

## Testing strategy

### Unit tests — `server/__tests__/auth-gate.test.ts` (new)

`runGate`:

- `authorize` provided → return value wins (true / false / async-true / async-false / throws → deny).
- `requireAuth: true` → allow on api-token, allow on admin, deny on users-permissions, deny on no auth.
- `requireAuth: "api-token"` → allow only api-token, deny admin.
- `requireAuth: "admin"` → mirror.
- `requireAuth: false` (or unset) → fall through to env gate.
- Env gate → deny on `NODE_ENV=production`, allow otherwise. `vi.stubEnv`.
- Priority: `authorize` overrides `requireAuth`; `requireAuth` overrides env gate.

`detectRestSignals`:

- Header present and matches → `header: true`.
- Header present but wrong value → `header: false`.
- `query.status === statusValue` → `nativeRest: true`. Custom `statusValue` honoured.

### Updated tests — `koa-middleware.test.ts`

- Allow + header → `ctx.query.status` set (existing, retained).
- Deny + header → `ctx.query.status` untouched (silent fallback). NEW.
- Deny + `?status=draft` + `guardNativeStatus: true` → rewritten to `"published"`. NEW.
- Deny + `?status=draft` + `guardNativeStatus: false` → untouched. NEW.
- Allow + `?status=draft` → untouched (passes through). NEW.

### Updated tests — `apollo-plugin.test.ts`

GraphQL mirror of the above:

- Header allow/deny.
- Explicit `status: DRAFT` allow/deny under `guardNativeStatus`.
- Existing tests for "explicit `status: PUBLISHED` ignores header" and "non-status-accepting fields untouched" remain green.

### Boot-time warning — `register.test.ts` (new or extended)

- `NODE_ENV=production`, no gate → `strapi.log.warn` called once.
- `NODE_ENV=production`, `requireAuth: true` → no warn.
- `NODE_ENV=production`, `authorize: () => true` → no warn.
- `NODE_ENV=development`, no gate → no warn.

### Integration tests — `tests/integration/`

Add: `requireAuth: true` scenario. Request with valid API token + header → drafts. Same request without token → published.

Existing integration tests use the default (unconfigured) plugin. Set `NODE_ENV=test` in `vitest.integration.config.ts` so the env gate allows by default — keeps existing test fixtures matching v1.0.0 behaviour without per-test config.

### Coverage

`auth-gate.ts` at 100% line + branch. Decision tree is load-bearing.

## Migration & release

**Version:** 2.0.0. Breaking for anyone running v1.x in production.

**Changeset entry (major):**

> Auth gate: in production, the preview header is ignored unless `authorize`, `requireAuth`, or non-`production` `NODE_ENV` says otherwise. New `guardNativeStatus` flag optionally extends the gate to native `?status=draft` and `status: DRAFT` paths.

**README updates:**

- "Why you'd want this" section reframed to lead with two value props:
  1. **Draft preview** — send a header, get drafts. (Existing pitch.)
  2. **Draft leak prevention** — Strapi's `find` permission grants access to drafts via `?status=draft`. For products where draft leakage matters (early announcements, embargoed content), this plugin's auth gate plus `guardNativeStatus: true` is the missing piece. (New pitch.)
- New "Security" section between "What you get" and "Configuration":
  - Trust model: header is a request; gate decides.
  - Default behaviour table: dev allows, prod denies unless configured.
  - Two real use cases (staging-only, admin-only-in-prod) with snippets.
  - `authorize: () => true` escape with a loud warning.
  - The `?status=draft` boundary and `guardNativeStatus` opt-in, framed as "stopping draft leaks Strapi's permissions don't catch."
  - IP allow-list one-liner under the `authorize` example.
- "Configuration" section grows with the three new keys and a worked example: single CMS, multiple frontend envs, per-env API tokens.
- "How it works" section gains a "How the gate works" subsection mirroring the decision flow.

**CHANGELOG entry** under `## 2.0.0` with "Migrating from 1.x":

1. Decide which use case applies (staging/dev only? admin-only? custom?).
2. Pick the matching config snippet.
3. If you genuinely want v1.0.0 behaviour, set `authorize: () => true` with a clear understanding that the header is now public.

**No deprecation warnings, no shim package.** Audience is ~238 downloads; clean break with clear migration docs beats a deprecation period.

**Next.js Draft Mode example PR** is deferred (per Q1 in brainstorming); will land as a follow-up using `requireAuth` to model the recommended pattern for new users.

## Worked example — multi-environment setup

Single Strapi CMS instance running in `NODE_ENV=production`. Three frontends:

| Frontend | Token                 | Sends header | Result            |
| -------- | --------------------- | ------------ | ----------------- |
| prod     | `prod-read` (or none) | no           | published content |
| UAT      | `preview-uat`         | yes          | drafts            |
| develop  | `preview-develop`     | yes          | drafts            |

Plugin config:

```js
"draft-preview": {
  enabled: true,
  config: {
    authorize: (ctx) =>
      ["preview-uat", "preview-develop"].includes(
        ctx.state.auth?.credentials?.name,
      ),
  },
},
```

Token leak in develop is recoverable: rotate `preview-develop` from the admin panel, redeploy develop. UAT untouched. prod was never affected.

For full leak prevention against authenticated callers passing `?status=draft` directly, add `guardNativeStatus: true` and lock down public-role `find` permissions on draft-publish content types.

**Implementation note:** the exact path for reading the token name (`ctx.state.auth.credentials.name`) needs verification against Strapi v5's API token strategy during implementation. If the path differs, update the worked example and the `requireAuth` built-in check accordingly.

## Worked example — specific user gets drafts in prod

Single Strapi running in `NODE_ENV=production`. One user (e.g. a marketing editor) needs draft access; everyone else, including other authenticated users, must not see drafts via _any_ path.

Three flavours depending on where the user lives:

### Strapi admin user

```js
"draft-preview": {
  enabled: true,
  config: {
    requireAuth: "admin",
    guardNativeStatus: true,
  },
},
```

Any admin-panel user calling `/api/*` with their admin JWT gets drafts. Cookie-style admin sessions are out of scope; admin must call with a Bearer token.

### Users-permissions user (role-based)

```js
"draft-preview": {
  enabled: true,
  config: {
    authorize: (ctx) => ctx.state.user?.role?.name === "Editor",
    guardNativeStatus: true,
  },
},
```

Pin to a single identity instead of a role: `ctx.state.user?.email === "alice@example.com"`.

### Specific API token

```js
"draft-preview": {
  enabled: true,
  config: {
    authorize: (ctx) =>
      ctx.state.auth?.credentials?.name === "alice-preview",
    guardNativeStatus: true,
  },
},
```

### Coverage table (applies to all three flavours)

| Caller                          | `?status=draft` (native) | `x-include-drafts` header   |
| ------------------------------- | ------------------------ | --------------------------- |
| Matching user                   | drafts                   | drafts                      |
| Non-matching authenticated user | rewritten → published    | silent fallback → published |
| Anonymous                       | rewritten → published    | silent fallback → published |

Both bypass paths run through the same gate. `guardNativeStatus: true` is the load-bearing flag — without it the native path leaks; with it, drafts are genuinely private.
