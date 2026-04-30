import type { Core } from "@strapi/strapi";
import type { AuthGateContext, RequireAuthOption } from "./config";

interface ApiTokenService {
  getBy: (q: Record<string, unknown>) => Promise<{
    expiresAt?: string | Date | null;
  } | null>;
  hash: (t: string) => string;
}

/**
 * Builds an `authorize` callback that honours `requireAuth` at the global
 * Koa middleware level, where `ctx.state.auth` is not yet populated by
 * Strapi's per-route `authenticate` middleware.
 *
 * Priority:
 *   1. `ctx.state.auth.strategy.name` — works today on the Apollo path,
 *      and future-proofs the Koa path if Strapi's middleware order changes.
 *   2. Direct Bearer-token lookup via Strapi's api-token service —
 *      mirrors Strapi's own api-token authenticate flow (hash → DB
 *      lookup → expiry check), used at the global Koa middleware level
 *      where ctx.state.auth has not yet been populated.
 */
export function buildRequireAuthAuthorize(
  strapi: Core.Strapi,
  requireAuth: RequireAuthOption,
): (ctx: AuthGateContext) => Promise<boolean> {
  return async (ctx: AuthGateContext) => {
    // Fast path: auth already on context.
    const strategyName = ctx.state?.auth?.strategy?.name;

    if (strategyName) {
      if (requireAuth === true) {
        return strategyName === "api-token" || strategyName === "admin";
      }

      return strategyName === requireAuth;
    }

    // Slow path: inspect the request directly.
    const authorization = ctx.request.header.authorization;
    const authHeader = Array.isArray(authorization)
      ? authorization[0]
      : authorization;

    if (!authHeader) return false;

    const parts = authHeader.split(/\s+/);

    if (parts[0]?.toLowerCase() !== "bearer" || parts.length !== 2) {
      return false;
    }

    const rawToken = parts[1];

    if (requireAuth === "admin") {
      // At the global Koa level, admin JWTs and API tokens are
      // indistinguishable without decoding the Bearer payload. The
      // fast path above (ctx.state.auth.strategy.name) handles admin
      // when auth has run; here we conservatively deny.
      return false;
    }

    // requireAuth is true or "api-token" — validate the api token.
    try {
      const apiTokenService = strapi.service(
        "admin::api-token",
      ) as ApiTokenService;

      const apiToken = await apiTokenService.getBy({
        accessKey: apiTokenService.hash(rawToken),
      });

      if (!apiToken) return false;

      // Match Strapi's own api-token strategy: reject expired tokens.
      if (
        apiToken.expiresAt != null &&
        new Date(apiToken.expiresAt) < new Date()
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  };
}
