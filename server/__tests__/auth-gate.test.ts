import { describe, expect, it } from "vitest";
import { checkBuiltInAuth, detectRestSignals } from "../auth-gate";
import { defaultConfig, type PluginConfig } from "../config";

const buildCtx = (overrides: {
  header?: Record<string, string>;
  query?: Record<string, unknown>;
}) => ({
  request: { header: overrides.header ?? {} },
  query: overrides.query ?? {},
});

describe("detectRestSignals", () => {
  it("flags header when present and matching expectedHeaderValue", () => {
    const ctx = buildCtx({ header: { "x-include-drafts": "true" } });
    const signals = detectRestSignals(ctx, defaultConfig);
    expect(signals).toEqual({ header: true, nativeRest: false });
  });

  it("does not flag header when value is wrong", () => {
    const ctx = buildCtx({ header: { "x-include-drafts": "false" } });
    const signals = detectRestSignals(ctx, defaultConfig);
    expect(signals).toEqual({ header: false, nativeRest: false });
  });

  it("flags nativeRest when query.status equals statusValue", () => {
    const ctx = buildCtx({ query: { status: "draft" } });
    const signals = detectRestSignals(ctx, defaultConfig);
    expect(signals).toEqual({ header: false, nativeRest: true });
  });

  it("does not flag nativeRest for status=published", () => {
    const ctx = buildCtx({ query: { status: "published" } });
    const signals = detectRestSignals(ctx, defaultConfig);
    expect(signals.nativeRest).toBe(false);
  });

  it("respects custom statusValue", () => {
    const customConfig: PluginConfig = {
      ...defaultConfig,
      statusValue: "preview",
    };
    const ctx = buildCtx({ query: { status: "preview" } });
    const signals = detectRestSignals(ctx, customConfig);
    expect(signals.nativeRest).toBe(true);
  });

  it("flags both signals if both present", () => {
    const ctx = buildCtx({
      header: { "x-include-drafts": "true" },
      query: { status: "draft" },
    });
    const signals = detectRestSignals(ctx, defaultConfig);
    expect(signals).toEqual({ header: true, nativeRest: true });
  });
});

const ctxWithStrategy = (name?: string) => ({
  request: { header: {} },
  state: name ? { auth: { strategy: { name } } } : { auth: undefined },
});

describe("checkBuiltInAuth", () => {
  it("returns false when requireAuth is false/undefined", () => {
    expect(checkBuiltInAuth(ctxWithStrategy("api-token"), false)).toBe(false);
    expect(checkBuiltInAuth(ctxWithStrategy("api-token"), undefined)).toBe(
      false,
    );
  });

  it("requireAuth=true allows api-token", () => {
    expect(checkBuiltInAuth(ctxWithStrategy("api-token"), true)).toBe(true);
  });

  it("requireAuth=true allows admin", () => {
    expect(checkBuiltInAuth(ctxWithStrategy("admin"), true)).toBe(true);
  });

  it("requireAuth=true denies users-permissions", () => {
    expect(checkBuiltInAuth(ctxWithStrategy("users-permissions"), true)).toBe(
      false,
    );
  });

  it("requireAuth=true denies unauthenticated", () => {
    expect(checkBuiltInAuth(ctxWithStrategy(undefined), true)).toBe(false);
  });

  it('requireAuth="api-token" allows only api-token', () => {
    expect(checkBuiltInAuth(ctxWithStrategy("api-token"), "api-token")).toBe(
      true,
    );
    expect(checkBuiltInAuth(ctxWithStrategy("admin"), "api-token")).toBe(false);
  });

  it('requireAuth="admin" allows only admin', () => {
    expect(checkBuiltInAuth(ctxWithStrategy("admin"), "admin")).toBe(true);
    expect(checkBuiltInAuth(ctxWithStrategy("api-token"), "admin")).toBe(false);
  });
});
