import type { Core } from "@strapi/strapi";
import { describe, expect, it, vi } from "vitest";
import register from "../register";
import { defaultConfig, type PluginConfig } from "../config";

const buildStrapi = (
  pluginConfig: PluginConfig,
  overrides: {
    apis?: Record<string, unknown>;
    plugins?: Record<string, unknown>;
  } = {},
) => {
  const log = { info: vi.fn(), warn: vi.fn() };
  const config = {
    get: vi.fn((key: string) => {
      if (key === "plugin::draft-preview") return pluginConfig;
      if (key === "api.rest.prefix") return "/api";
      if (key === "plugin::graphql.apolloServer.plugins") return [];
      return undefined;
    }),
    set: vi.fn(),
  };
  const server = { app: { use: vi.fn() } };
  const plugin = vi.fn(() => null);
  const hookHandlers: Record<string, (() => void)[]> = {};
  const hook = vi.fn((name: string) => ({
    register: (fn: () => void) => {
      hookHandlers[name] = hookHandlers[name] ?? [];
      hookHandlers[name].push(fn);
    },
  }));
  const fireHook = (name: string) => {
    for (const fn of hookHandlers[name] ?? []) fn();
  };
  return {
    strapi: {
      log,
      config,
      server,
      plugin,
      hook,
      apis: overrides.apis ?? {},
      plugins: overrides.plugins ?? {},
    } as unknown as Core.Strapi,
    log,
    fireHook,
  };
};

describe("register — boot-time warning", () => {
  it("warns in production when no gate is configured", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { strapi, log } = buildStrapi(defaultConfig);
      register({ strapi });
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn.mock.calls[0][0]).toMatch(
        /running in production with no auth gate/,
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("does not warn when authorize is set", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { strapi, log } = buildStrapi({
        ...defaultConfig,
        authorize: () => true,
      });
      register({ strapi });
      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("does not warn when requireAuth is set", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { strapi, log } = buildStrapi({
        ...defaultConfig,
        requireAuth: true,
      });
      register({ strapi });
      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("does not warn outside production", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const { strapi, log } = buildStrapi(defaultConfig);
      register({ strapi });
      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("register — route injection", () => {
  it("appends the middleware to a content-api route", () => {
    const route = { method: "GET", path: "/articles", handler: "article.find" };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      apis: {
        article: {
          routes: {
            default: { type: "content-api", routes: [route] },
          },
        },
      },
    });

    register({ strapi });
    fireHook("strapi::content-types.afterSync");

    expect(Array.isArray(route.config?.middlewares)).toBe(true);
    expect(typeof route.config?.middlewares?.[0]).toBe("function");
  });

  it("skips admin routes", () => {
    const route = { method: "GET", path: "/articles", handler: "article.find" };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      apis: {
        article: {
          routes: {
            default: { type: "admin", routes: [route] },
          },
        },
      },
    });

    register({ strapi });
    fireHook("strapi::content-types.afterSync");

    expect(route.config).toBeUndefined();
  });

  it("injects into object-shape plugin routes (users-permissions style)", () => {
    const route = { method: "GET", path: "/users", handler: "user.find" };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      plugins: {
        "users-permissions": {
          routes: {
            "content-api": { type: "content-api", routes: [route] },
            admin: { type: "admin", routes: [] },
          },
        },
      },
    });

    register({ strapi });
    fireHook("strapi::content-types.afterSync");

    expect(Array.isArray(route.config?.middlewares)).toBe(true);
    expect(typeof route.config?.middlewares?.[0]).toBe("function");
  });

  it("skips flat-array plugin routes", () => {
    const route = { method: "GET", path: "/foo", handler: "foo.bar" };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      plugins: {
        foo: {
          routes: [route],
        },
      },
    });

    register({ strapi });
    fireHook("strapi::content-types.afterSync");

    expect((route as Record<string, unknown>).config).toBeUndefined();
  });

  it("preserves existing middlewares and appends ours", () => {
    const route = {
      method: "GET",
      path: "/articles",
      handler: "article.find",
      config: { middlewares: ["existing"] as unknown[] },
    };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      apis: {
        article: {
          routes: {
            default: { type: "content-api", routes: [route] },
          },
        },
      },
    });

    register({ strapi });
    fireHook("strapi::content-types.afterSync");

    expect(route.config.middlewares[0]).toBe("existing");
    expect(typeof route.config.middlewares[1]).toBe("function");
  });

  it("creates config and middlewares when route has no config property", () => {
    const route = { method: "GET", path: "/articles", handler: "article.find" };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      apis: {
        article: {
          routes: {
            default: { type: "content-api", routes: [route] },
          },
        },
      },
    });

    register({ strapi });
    fireHook("strapi::content-types.afterSync");

    expect(route.config).toBeDefined();
    expect(Array.isArray(route.config?.middlewares)).toBe(true);
    expect(route.config?.middlewares).toHaveLength(1);
  });

  it("does NOT mutate routes until the afterSync hook fires", () => {
    const route = { method: "GET", path: "/articles", handler: "article.find" };
    const { strapi, fireHook } = buildStrapi(defaultConfig, {
      apis: {
        article: {
          routes: {
            default: { type: "content-api", routes: [route] },
          },
        },
      },
    });

    register({ strapi });

    // After register but before the hook fires, routes are untouched.
    // Important so other plugins' register hooks (e.g. wysiwyg's custom
    // field registration) can complete before our route iteration triggers
    // the lazy `routes` getter.
    expect(route.config).toBeUndefined();

    fireHook("strapi::content-types.afterSync");

    expect(typeof route.config?.middlewares?.[0]).toBe("function");
  });
});
