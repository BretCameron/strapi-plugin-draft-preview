import type { Core } from "@strapi/strapi";
import { describe, expect, it, vi } from "vitest";
import register from "../register";
import { defaultConfig, type PluginConfig } from "../config";

const buildStrapi = (pluginConfig: PluginConfig) => {
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
  return {
    strapi: { log, config, server, plugin } as unknown as Core.Strapi,
    log,
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
