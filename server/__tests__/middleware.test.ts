import type { Core } from "@strapi/strapi";
import { describe, expect, it, vi } from "vitest";
import { createDraftPreviewMiddleware } from "../middleware";
import { defaultConfig } from "../config";

const buildStrapi = (overrides: { apiPrefix?: string } = {}) => {
  const config = {
    get: vi.fn((key: string) => {
      if (key === "plugin::draft-preview") return defaultConfig;
      if (key === "api.rest.prefix") return overrides.apiPrefix ?? "/api";
      return undefined;
    }),
  };
  return { config } as unknown as Core.Strapi;
};

describe("createDraftPreviewMiddleware", () => {
  it("returns a middleware function bound to the plugin's config", () => {
    const strapi = buildStrapi();
    const middleware = createDraftPreviewMiddleware({ strapi });

    expect(typeof middleware).toBe("function");
  });

  it("the returned middleware applies the gate when the header is set", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const strapi = buildStrapi();
      const middleware = createDraftPreviewMiddleware({ strapi });
      const ctx = {
        path: "/api/articles",
        request: { header: { "x-include-drafts": "true" } },
        query: {} as Record<string, unknown>,
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(ctx, next);

      expect(ctx.query.status).toBe("draft");
      expect(next).toHaveBeenCalledOnce();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("respects a custom apiPrefix from strapi config", async () => {
    const strapi = buildStrapi({ apiPrefix: "/v2" });
    const middleware = createDraftPreviewMiddleware({ strapi });
    const ctx = {
      path: "/v2/articles",
      request: { header: { "x-include-drafts": "true" } },
      query: {} as Record<string, unknown>,
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("draft");
  });

  it("ignores requests outside the configured apiPrefix", async () => {
    const strapi = buildStrapi();
    const middleware = createDraftPreviewMiddleware({ strapi });
    const ctx = {
      path: "/admin/users",
      request: { header: { "x-include-drafts": "true" } },
      query: {} as Record<string, unknown>,
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBeUndefined();
  });
});
