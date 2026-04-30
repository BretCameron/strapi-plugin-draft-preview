import { describe, expect, it } from "vitest";
import { detectRestSignals } from "../auth-gate";
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
