import type { Core } from "@strapi/strapi";
import { describe, expect, it, vi } from "vitest";
import { buildRequireAuthAuthorize } from "../require-auth-authorize";

const buildMockStrapi = (apiTokenService: {
  getBy?: (q: Record<string, unknown>) => Promise<unknown>;
  hash?: (t: string) => string;
}) =>
  ({
    service: vi.fn((name: string) => {
      if (name === "admin::api-token") return apiTokenService;
      return null;
    }),
  }) as unknown as Core.Strapi;

const ctxWithHeader = (
  authorization?: string | string[],
  state?: { auth?: { strategy?: { name?: string } } },
) => ({
  request: {
    header: authorization === undefined ? {} : { authorization },
  },
  ...(state ? { state } : {}),
});

describe("buildRequireAuthAuthorize", () => {
  describe("fast path (ctx.state.auth populated)", () => {
    it("requireAuth=true allows api-token strategy", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "api-token" } },
      });
      expect(await authorize(ctx)).toBe(true);
    });

    it("requireAuth=true allows admin strategy", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "admin" } },
      });
      expect(await authorize(ctx)).toBe(true);
    });

    it('requireAuth="admin" allows admin strategy', async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, "admin");
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "admin" } },
      });
      expect(await authorize(ctx)).toBe(true);
    });

    it('requireAuth="admin" denies api-token strategy', async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, "admin");
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "api-token" } },
      });
      expect(await authorize(ctx)).toBe(false);
    });

    it('requireAuth="api-token" allows api-token strategy', async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, "api-token");
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "api-token" } },
      });
      expect(await authorize(ctx)).toBe(true);
    });

    it('requireAuth="api-token" denies admin strategy', async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, "api-token");
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "admin" } },
      });
      expect(await authorize(ctx)).toBe(false);
    });

    it("requireAuth=true denies unknown strategy", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      const ctx = ctxWithHeader(undefined, {
        auth: { strategy: { name: "unknown" } },
      });
      expect(await authorize(ctx)).toBe(false);
    });
  });

  describe("slow path — header parsing", () => {
    it("denies when no Authorization header", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader())).toBe(false);
    });

    it("denies non-Bearer scheme", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Basic abc123"))).toBe(false);
    });

    it("denies malformed Bearer (no token)", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer"))).toBe(false);
    });

    it("denies malformed Bearer (extra parts)", async () => {
      const strapi = buildMockStrapi({});
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer foo bar"))).toBe(false);
    });

    it("uses first value when authorization is an array", async () => {
      const getBy = vi.fn().mockResolvedValue({ expiresAt: null });
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      const result = await authorize(
        ctxWithHeader(["Bearer abc", "Bearer xyz"]),
      );
      expect(result).toBe(true);
      expect(hash).toHaveBeenCalledWith("abc");
    });

    it("Bearer scheme is case-insensitive", async () => {
      const getBy = vi.fn().mockResolvedValue({ expiresAt: null });
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("bearer abc"))).toBe(true);
    });
  });

  describe("slow path — admin", () => {
    it('requireAuth="admin" denies in slow path even with valid Bearer', async () => {
      const getBy = vi.fn();
      const hash = vi.fn();
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, "admin");
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(false);
      expect(getBy).not.toHaveBeenCalled();
    });
  });

  describe("slow path — api-token validation", () => {
    it("allows when token exists and has no expiry", async () => {
      const getBy = vi.fn().mockResolvedValue({ expiresAt: null });
      const hash = vi.fn().mockReturnValue("hashed-abc");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(true);
      expect(hash).toHaveBeenCalledWith("abc");
      expect(getBy).toHaveBeenCalledWith({ accessKey: "hashed-abc" });
    });

    it("allows when token exists and is not expired", async () => {
      const future = new Date(Date.now() + 1_000_000).toISOString();
      const getBy = vi.fn().mockResolvedValue({ expiresAt: future });
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(true);
    });

    it("denies when token does not exist", async () => {
      const getBy = vi.fn().mockResolvedValue(null);
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(false);
    });

    it("denies expired token", async () => {
      const past = new Date(Date.now() - 1_000_000).toISOString();
      const getBy = vi.fn().mockResolvedValue({ expiresAt: past });
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(false);
    });

    it("denies when api-token service throws", async () => {
      const getBy = vi.fn().mockRejectedValue(new Error("DB down"));
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(false);
    });

    it('requireAuth="api-token" hits the same path as true', async () => {
      const getBy = vi.fn().mockResolvedValue({ expiresAt: null });
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, "api-token");
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(true);
    });

    it("allows token with expiresAt undefined (no expiry field)", async () => {
      const getBy = vi.fn().mockResolvedValue({});
      const hash = vi.fn().mockReturnValue("hashed");
      const strapi = buildMockStrapi({ getBy, hash });
      const authorize = buildRequireAuthAuthorize(strapi, true);
      expect(await authorize(ctxWithHeader("Bearer abc"))).toBe(true);
    });
  });
});
