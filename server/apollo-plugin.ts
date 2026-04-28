import type { PluginConfig } from "./config";

interface WillResolveFieldArgs {
  source: unknown;
  args: Record<string, unknown>;
  contextValue: {
    koaContext?: { request?: { header?: Record<string, string | string[] | undefined> } };
    rootQueryArgs?: Record<string, unknown>;
  };
  info: {
    fieldName: string;
    operation: { operation: string };
    parentType: { getFields(): Record<string, { args?: Array<{ name: string }> }> };
    fieldNodes?: ReadonlyArray<{
      arguments?: ReadonlyArray<{ name?: { value?: string } }>;
    }>;
  };
}

/**
 * Apollo Server plugin factory. Returns a plugin that injects
 * `status: "<statusValue>"` into the args of any built-in Strapi GraphQL
 * query that accepts a `status` argument, when the request carries the
 * configured header.
 *
 * Why a plugin instead of resolversConfig middleware:
 *   Strapi's own bootstrap registers a `willResolveField` plugin that
 *   captures `contextValue.rootQueryArgs` from the root query's args.
 *   The association resolver for relations reads `rootQueryArgs.status`
 *   to decide which side of the draft/published split to populate from.
 *   A resolversConfig middleware runs AFTER that snapshot is captured,
 *   so its mutation never reaches relation populates — drafts come back
 *   with all relations as null. Hooking willResolveField directly lets
 *   us mutate args at the same lifecycle stage.
 *
 * Plugin order with Strapi's own plugin is not guaranteed across versions,
 * so we mutate both `args.status` (in case we run first) and
 * `rootQueryArgs.status` (in case we run after).
 */
export function createApolloPlugin(config: PluginConfig) {
  return {
    async requestDidStart() {
      return {
        async executionDidStart() {
          return {
            willResolveField(params: WillResolveFieldArgs) {
              applyDraftStatus(params, config);
            },
          };
        },
      };
    },
  };
}

/**
 * Pure helper exposed for testing. Mutates `args` and `rootQueryArgs` in
 * place when all conditions for draft injection are met.
 */
export function applyDraftStatus(
  { source, args, contextValue, info }: WillResolveFieldArgs,
  config: PluginConfig,
): void {
  const headerValue = contextValue?.koaContext?.request?.header?.[config.headerName];

  if (headerValue !== config.expectedHeaderValue) return;

  // Only act on root query fields. Sub-fields have a non-null source.
  if (source) return;
  if (info.operation.operation !== "query") return;

  // Honour an explicit `status` from the user. Read the AST rather than
  // args.status, because Strapi's schema defaults status to PUBLISHED so
  // args.status is always set even when the query didn't pass it.
  const fieldNode = info.fieldNodes?.[0];
  const explicitStatus = fieldNode?.arguments?.some(
    (a) => a.name?.value === "status",
  );

  if (explicitStatus) return;

  // Skip fields whose schema doesn't declare a `status` arg. Custom
  // resolvers and non-draftAndPublish content types are left alone.
  const fieldDef = info.parentType.getFields()[info.fieldName];
  const acceptsStatus = fieldDef?.args?.some((arg) => arg.name === "status");

  if (!acceptsStatus) return;

  args.status = config.statusValue;

  if (contextValue?.rootQueryArgs) {
    contextValue.rootQueryArgs.status = config.statusValue;
  }
}
