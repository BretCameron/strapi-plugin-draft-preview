import { runGate } from "./auth-gate";
import type { AuthGateContext, PluginConfig } from "./config";

interface WillResolveFieldArgs {
  source: unknown;
  args: Record<string, unknown>;
  contextValue: {
    koaContext?: AuthGateContext;
    rootQueryArgs?: Record<string, unknown>;
  };
  info: {
    fieldName: string;
    operation: { operation: string };
    parentType: { getFields(): Record<string, { args?: { name: string }[] }> };
    fieldNodes?: readonly {
      arguments?: readonly {
        name?: { value?: string };
        value?: { kind?: string; value?: string };
      }[];
    }[];
  };
}

/**
 * Apollo Server plugin factory. Returns a plugin that applies the
 * draft-preview auth gate to every root query field that accepts a
 * `status` argument.
 */
export function createApolloPlugin(config: PluginConfig) {
  return {
    requestDidStart() {
      return Promise.resolve({
        executionDidStart() {
          return Promise.resolve({
            async willResolveField(params: WillResolveFieldArgs) {
              await applyDraftStatus(params, config);
            },
          });
        },
      });
    },
  };
}

export async function applyDraftStatus(
  { source, args, contextValue, info }: WillResolveFieldArgs,
  config: PluginConfig,
): Promise<void> {
  // Only act on root query fields. Sub-fields have a non-null source.
  if (source) return;
  if (info.operation.operation !== "query") return;

  const fieldDef = info.parentType.getFields()[info.fieldName];
  const acceptsStatus = fieldDef?.args?.some((arg) => arg.name === "status");
  if (!acceptsStatus) return;

  const koaCtx = contextValue?.koaContext;
  if (!koaCtx) return;

  const headerValue = koaCtx.request?.header?.[config.headerName];
  const headerRequestsDrafts = headerValue === config.expectedHeaderValue;

  // Detect explicit `status: …` arg in the AST. We need to know both
  // *whether* the user passed status, and *what value*, so we can tell
  // an explicit DRAFT (a native draft request) apart from explicit
  // PUBLISHED (which we always honour).
  const fieldNode = info.fieldNodes?.[0];
  const explicitStatusArg = fieldNode?.arguments?.find(
    (a) => a.name?.value === "status",
  );
  const explicitStatusValue = explicitStatusArg?.value?.value;

  const explicitlyDraft = explicitStatusValue === "DRAFT";
  const explicitlyPublished = explicitStatusValue === "PUBLISHED";

  if (explicitlyPublished) return;

  if (!headerRequestsDrafts && !explicitlyDraft) return;

  const allowed = await runGate(koaCtx, config);

  if (allowed) {
    if (headerRequestsDrafts) {
      args.status = config.statusValue;

      if (contextValue?.rootQueryArgs) {
        contextValue.rootQueryArgs.status = config.statusValue;
      }
    }
    // explicitlyDraft on allow: leave args.status alone (Strapi serves it).
    return;
  }

  // Denied.
  if (explicitlyDraft && config.guardNativeStatus) {
    args.status = "published";

    if (contextValue?.rootQueryArgs) {
      contextValue.rootQueryArgs.status = "published";
    }
  }
  // Header on deny: silent fallback, no mutation.
}
