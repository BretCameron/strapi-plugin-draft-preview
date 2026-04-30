import { describe, expect, it, vi } from "vitest";
import { createKoaMiddleware } from "../koa-middleware";
import { defaultConfig, type PluginConfig } from "../config";

const buildCtx = (overrides: {
  path?: string;
  header?: Record<string, string>;
  query?: Record<string, unknown>;
}) => ({
  path: overrides.path ?? "/api/articles",
  request: { header: overrides.header ?? {} },
  query: overrides.query ?? {},
});

const config: PluginConfig = defaultConfig;

describe("createKoaMiddleware", () => {
  it("injects status: draft when header is set on an /api request", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
    const ctx = buildCtx({ header: { "x-include-drafts": "true" } });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("draft");
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not act on requests outside the API prefix", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
    const ctx = buildCtx({
      path: "/admin/users/me",
      header: { "x-include-drafts": "true" },
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not act on /graphql even though it's not under /api", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
    const ctx = buildCtx({
      path: "/graphql",
      header: { "x-include-drafts": "true" },
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBeUndefined();
  });

  it("does nothing when the header is missing", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
    const ctx = buildCtx({});
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBeUndefined();
  });

  it("does nothing when the header value doesn't match expected", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
    const ctx = buildCtx({ header: { "x-include-drafts": "false" } });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBeUndefined();
  });

  it("honours an explicit status query param", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
    const ctx = buildCtx({
      header: { "x-include-drafts": "true" },
      query: { status: "published" },
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("published");
  });

  it("respects custom apiPrefix", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/v2" });
    const ctx = buildCtx({
      path: "/v2/articles",
      header: { "x-include-drafts": "true" },
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("draft");
  });

  it("normalises a trailing slash on apiPrefix", async () => {
    const middleware = createKoaMiddleware({ config, apiPrefix: "/api/" });
    const ctx = buildCtx({
      path: "/api/articles",
      header: { "x-include-drafts": "true" },
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("draft");
  });

  it("respects custom headerName and statusValue", async () => {
    const customConfig: PluginConfig = {
      headerName: "x-strapi-preview",
      expectedHeaderValue: "1",
      statusValue: "preview",
    };
    const middleware = createKoaMiddleware({
      config: customConfig,
      apiPrefix: "/api",
    });
    const ctx = buildCtx({ header: { "x-strapi-preview": "1" } });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("preview");
  });

  it("silent fallback: header sent but gate denies (production, no auth)", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
      const ctx = buildCtx({ header: { "x-include-drafts": "true" } });
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(ctx, next);

      expect(ctx.query.status).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("authorize=true allows the header through in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const allowing: PluginConfig = { ...config, authorize: () => true };
      const middleware = createKoaMiddleware({
        config: allowing,
        apiPrefix: "/api",
      });
      const ctx = buildCtx({ header: { "x-include-drafts": "true" } });
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(ctx, next);

      expect(ctx.query.status).toBe("draft");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("native ?status=draft with guardNativeStatus rewrites to published when denied", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const guarded: PluginConfig = { ...config, guardNativeStatus: true };
      const middleware = createKoaMiddleware({
        config: guarded,
        apiPrefix: "/api",
      });
      const ctx = buildCtx({ query: { status: "draft" } });
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(ctx, next);

      expect(ctx.query.status).toBe("published");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("native ?status=draft without guardNativeStatus is left alone", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const middleware = createKoaMiddleware({ config, apiPrefix: "/api" });
      const ctx = buildCtx({ query: { status: "draft" } });
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(ctx, next);

      expect(ctx.query.status).toBe("draft");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("native ?status=draft passes through when gate allows", async () => {
    // NODE_ENV is not 'production' under vitest; env gate allows.
    const guarded: PluginConfig = { ...config, guardNativeStatus: true };
    const middleware = createKoaMiddleware({
      config: guarded,
      apiPrefix: "/api",
    });
    const ctx = buildCtx({ query: { status: "draft" } });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.query.status).toBe("draft");
  });
});
