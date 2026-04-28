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
    rootQueryArgs = {},
  } = overrides;

  const fieldArgs = acceptsStatus
    ? [{ name: "status" }, { name: "filters" }]
    : [{ name: "filters" }];

  const argumentNodes = explicitStatus ? [{ name: { value: "status" } }] : [];

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
  it("injects draft status when header is set and field accepts status", () => {
    const params = buildParams({ header: "true" });

    applyDraftStatus(params, config);

    expect(params.args.status).toBe("draft");
    expect(params.contextValue.rootQueryArgs?.status).toBe("draft");
  });

  it("overrides a default-valued args.status (Strapi schema sets PUBLISHED)", () => {
    const params = buildParams({
      header: "true",
      args: { status: "published" },
    });

    applyDraftStatus(params, config);

    expect(params.args.status).toBe("draft");
  });

  it("honours an explicit status arg from the query AST", () => {
    const params = buildParams({
      header: "true",
      explicitStatus: true,
      args: { status: "published" },
    });

    applyDraftStatus(params, config);

    expect(params.args.status).toBe("published");
    expect(params.contextValue.rootQueryArgs?.status).toBeUndefined();
  });

  it("does nothing when the header is missing", () => {
    const params = buildParams({});

    applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
    expect(params.contextValue.rootQueryArgs?.status).toBeUndefined();
  });

  it("does nothing when the header value doesn't match expected", () => {
    const params = buildParams({ header: "false" });

    applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("does nothing for sub-fields (source defined)", () => {
    const params = buildParams({
      header: "true",
      source: { documentId: "abc" },
      fieldName: "section",
    });

    applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("does nothing for mutation operations", () => {
    const params = buildParams({ header: "true", operation: "mutation" });

    applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("skips fields that don't accept a status arg", () => {
    const params = buildParams({ header: "true", acceptsStatus: false });

    applyDraftStatus(params, config);

    expect(params.args.status).toBeUndefined();
  });

  it("works when rootQueryArgs is absent (mutates args only)", () => {
    const params = buildParams({ header: "true", rootQueryArgs: null });

    applyDraftStatus(params, config);

    expect(params.args.status).toBe("draft");
  });

  it("respects custom headerName from config", () => {
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

    applyDraftStatus(params, customConfig);

    expect(params.args.status).toBe("draft");
  });

  it("respects custom statusValue from config", () => {
    const customConfig: PluginConfig = {
      ...defaultConfig,
      statusValue: "preview",
    };
    const params = buildParams({ header: "true" });

    applyDraftStatus(params, customConfig);

    expect(params.args.status).toBe("preview");
    expect(params.contextValue.rootQueryArgs?.status).toBe("preview");
  });
});

describe("createApolloPlugin", () => {
  it("returns an Apollo plugin whose willResolveField mutates args end-to-end", async () => {
    const plugin = createApolloPlugin(defaultConfig);

    const requestState = await plugin.requestDidStart();
    const executionState = await requestState.executionDidStart();

    const params = buildParams({ header: "true" });
    executionState.willResolveField(params);

    expect(params.args.status).toBe("draft");
    expect(params.contextValue.rootQueryArgs?.status).toBe("draft");
  });
});
