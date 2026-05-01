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

interface ExecutionDidStartArgs {
  contextValue?: {
    koaContext?: AuthGateContext;
    rootQueryArgs?: Record<string, unknown>;
  };
}

/**
 * Apollo Server plugin factory.
 *
 * Apollo expects `willResolveField` to return synchronously — anything
 * truthy/non-undefined is treated as a `didEndHook` callback. An `async`
 * `willResolveField` returns `Promise<void>`, which Apollo's
 * `invokeSyncDidStartHook` mistakenly tries to invoke as a function and
 * throws `TypeError: didEndHook is not a function`. So the gate decision
 * (the only async work we need) is computed once per request in
 * `executionDidStart` (which Apollo *does* await), cached in closure, and
 * read synchronously by `willResolveField`.
 */
export function createApolloPlugin(config: PluginConfig) {
  return {
    requestDidStart() {
      return Promise.resolve({
        async executionDidStart(execArgs: ExecutionDidStartArgs) {
          const koaCtx = execArgs?.contextValue?.koaContext;
          // No koaCtx (shouldn't happen in Strapi) → deny by default.
          const allowed = koaCtx ? await runGate(koaCtx, config) : false;
          return {
            willResolveField(params: WillResolveFieldArgs) {
              applyDraftStatusSync(params, config, allowed);
            },
          };
        },
      });
    },
  };
}

/**
 * Async wrapper retained for unit tests that drive the plugin directly
 * without going through Apollo's lifecycle. Production callers go through
 * `createApolloPlugin` which precomputes `allowed` once per request.
 */
export async function applyDraftStatus(
  params: WillResolveFieldArgs,
  config: PluginConfig,
): Promise<void> {
  const koaCtx = params.contextValue?.koaContext;
  const allowed = koaCtx ? await runGate(koaCtx, config) : false;
  applyDraftStatusSync(params, config, allowed);
}

function applyDraftStatusSync(
  { source, args, contextValue, info }: WillResolveFieldArgs,
  config: PluginConfig,
  allowed: boolean,
): void {
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
  // Note: GraphQL VariableNode args (e.g. `status: $s`) carry no value
  // here, so they're treated as "no explicit status" — header path applies.

  const explicitlyDraft = explicitStatusValue === "DRAFT";
  const explicitlyPublished = explicitStatusValue === "PUBLISHED";

  if (explicitlyPublished) return;

  if (!headerRequestsDrafts && !explicitlyDraft) return;

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
