import { describe, expect, it } from "vitest";
import { applyDraftStatus, createApolloPlugin } from "../apollo-plugin";
import { defaultConfig, type PluginConfig } from "../config";

type Params = Parameters<typeof applyDraftStatus>[0];

const buildParams = (overrides: {
  header?: string;
  source?: unknown;
  operation?: string;
  fieldName?: string;
  args?: Record<string, unknown>;
  acceptsStatus?: boolean;
  explicitStatus?: boolean;
  explicitStatusValue?: "DRAFT" | "PUBLISHED";
  rootQueryArgs?: Record<string, unknown> | null;
}): Params => {
  const {
    header,
    source = undefined,
    operation = "query",
    fieldName = "portalResources",
    args = {},
    acceptsStatus = true,
    explicitStatus = false,
    explicitStatusValue,
    rootQueryArgs = {},
  } = overrides;

  const fieldArgs = acceptsStatus
    ? [{ name: "status" }, { name: "filters" }]
    : [{ name: "filters" }];

  const argumentNodes =
    explicitStatus || explicitStatusValue
      ? [
          {
            name: { value: "status" },
            value: explicitStatusValue
              ? { kind: "EnumValue", value: explicitStatusValue }
              : { kind: "EnumValue", value: "PUBLISHED" },
          },
        ]
      : [];

  return {
    source,
    args,
    contextValue: {
      koaContext: header
        ? { request: { header: { "x-include-drafts": header } } }
        : { request: { header: {} } },
      ...(rootQueryArgs === null ? {} : { rootQueryArgs }),
    },
    info: {
      fieldName,
      operation: { operation },
      parentType: {
        getFields: () => ({
          [fieldName]: { args: fieldArgs },
        }),
      },
      fieldNodes: [{ arguments: argumentNodes }],
    },
  };
};

const config: PluginConfig = defaultConfig;

describe("applyDraftStatus", () => {
  it("injects draft status when header is set and field accepts status", async () => {
    const params = buildParams({ header: "true" });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBe("draft");
    expect(params.contextValue.rootQueryArgs?.status).toBe("draft");
  });

  it("overrides a default-valued args.status (Strapi schema sets PUBLISHED)", async () => {
    const params = buildParams({
      header: "true",
      args: { status: "published" },
    });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBe("draft");
  });

  it("honours an explicit status arg from the query AST", async () => {
    const params = buildParams({
      header: "true",
      explicitStatus: true,
      args: { status: "published" },
    });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBe("published");
    expect(params.contextValue.rootQueryArgs?.status).toBeUndefined();
  });

  it("does nothing when the header is missing", async () => {
    const params = buildParams({});

    await applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
    expect(params.contextValue.rootQueryArgs?.status).toBeUndefined();
  });

  it("does nothing when the header value doesn't match expected", async () => {
    const params = buildParams({ header: "false" });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("does nothing for sub-fields (source defined)", async () => {
    const params = buildParams({
      header: "true",
      source: { documentId: "abc" },
      fieldName: "section",
    });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("does nothing for mutation operations", async () => {
    const params = buildParams({ header: "true", operation: "mutation" });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("skips fields that don't accept a status arg", async () => {
    const params = buildParams({ header: "true", acceptsStatus: false });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("works when rootQueryArgs is absent (mutates args only)", async () => {
    const params = buildParams({ header: "true", rootQueryArgs: null });

    await applyDraftStatus(params, config);

    expect(params.args.status).toBe("draft");
  });

  it("respects custom headerName from config", async () => {
    const customConfig: PluginConfig = {
      ...defaultConfig,
      headerName: "x-strapi-preview",
    };
    const params: Params = {
      source: undefined,
      args: {},
      contextValue: {
        koaContext: { request: { header: { "x-strapi-preview": "true" } } },
        rootQueryArgs: {},
      },
      info: {
        fieldName: "portalResources",
        operation: { operation: "query" },
        parentType: {
          getFields: () => ({
            portalResources: { args: [{ name: "status" }] },
          }),
        },
        fieldNodes: [{ arguments: [] }],
      },
    };

    await applyDraftStatus(params, customConfig);

    expect(params.args.status).toBe("draft");
  });

  it("respects custom statusValue from config", async () => {
    const customConfig: PluginConfig = {
      ...defaultConfig,
      statusValue: "preview",
    };
    const params = buildParams({ header: "true" });

    await applyDraftStatus(params, customConfig);

    expect(params.args.status).toBe("preview");
    expect(params.contextValue.rootQueryArgs?.status).toBe("preview");
  });

  it("silent fallback: header sent but gate denies (production, no auth)", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const params = buildParams({ header: "true" });
      await applyDraftStatus(params, config);
      expect(params.args.status).toBeUndefined();
      expect(params.contextValue.rootQueryArgs?.status).toBeUndefined();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("authorize=true allows the header through in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const allowing: PluginConfig = { ...config, authorize: () => true };
      const params = buildParams({ header: "true" });
      await applyDraftStatus(params, allowing);
      expect(params.args.status).toBe("draft");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("explicit status: DRAFT passes through when gate allows", async () => {
    const guarded: PluginConfig = { ...config, guardNativeStatus: true };
    const params = buildParams({
      explicitStatusValue: "DRAFT",
      args: { status: "draft" },
    });
    await applyDraftStatus(params, guarded);
    expect(params.args.status).toBe("draft");
  });

  it("explicit status: DRAFT rewritten to published on deny when guardNativeStatus is set", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const guarded: PluginConfig = { ...config, guardNativeStatus: true };
      const params = buildParams({
        explicitStatusValue: "DRAFT",
        args: { status: "draft" },
      });
      await applyDraftStatus(params, guarded);
      expect(params.args.status).toBe("published");
      expect(params.contextValue.rootQueryArgs?.status).toBe("published");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("explicit status: DRAFT left alone on deny without guardNativeStatus", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const params = buildParams({
        explicitStatusValue: "DRAFT",
        args: { status: "draft" },
      });
      await applyDraftStatus(params, config);
      expect(params.args.status).toBe("draft");
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("createApolloPlugin", () => {
  it("returns an Apollo plugin whose willResolveField mutates args end-to-end", async () => {
    const plugin = createApolloPlugin(defaultConfig);

    const requestState = await plugin.requestDidStart();
    const executionState = await requestState.executionDidStart();

    const params = buildParams({ header: "true" });
    await executionState.willResolveField(params);

    expect(params.args.status).toBe("draft");
    expect(params.contextValue.rootQueryArgs?.status).toBe("draft");
  });
});
