export type AuthGateContext = {
  request: { header: Record<string, string | string[] | undefined> };
  state?: {
    auth?: {
      strategy?: { name?: string };
      credentials?: unknown;
    };
  };
};

export type RequireAuthOption = true | false | "api-token" | "admin";

export interface PluginConfig {
  /** HTTP header that triggers draft injection. Defaults to `x-include-drafts`. */
  headerName: string;
  /** Header value treated as truthy. Defaults to `"true"`. */
  expectedHeaderValue: string;
  /** Status string to inject. Defaults to `"draft"`. */
  statusValue: string;
  /**
   * Custom authorisation predicate. If provided, its return value is the
   * gate's decision. Throwing → deny.
   */
  authorize?: (ctx: AuthGateContext) => boolean | Promise<boolean>;
  /**
   * Built-in auth check. `true` ≡ "api-token OR admin". String forms
   * pin to one strategy. Falsy/unset → fall through to env gate.
   */
  requireAuth?: RequireAuthOption;
  /**
   * When the gate denies, also rewrite native draft signals
   * (`?status=draft` and GraphQL `status: DRAFT`) to "published".
   * Default: false.
   */
  guardNativeStatus?: boolean;
}

export const defaultConfig: PluginConfig = {
  headerName: "x-include-drafts",
  expectedHeaderValue: "true",
  statusValue: "draft",
};

const validRequireAuth = new Set([true, false, "api-token", "admin"]);

export default {
  default: defaultConfig,
  validator(config: Partial<PluginConfig>) {
    if (
      config.headerName !== undefined &&
      typeof config.headerName !== "string"
    ) {
      throw new Error(
        "strapi-plugin-draft-preview: headerName must be a string",
      );
    }

    if (
      config.expectedHeaderValue !== undefined &&
      typeof config.expectedHeaderValue !== "string"
    ) {
      throw new Error(
        "strapi-plugin-draft-preview: expectedHeaderValue must be a string",
      );
    }

    if (
      config.statusValue !== undefined &&
      typeof config.statusValue !== "string"
    ) {
      throw new Error(
        "strapi-plugin-draft-preview: statusValue must be a string",
      );
    }

    if (
      config.authorize !== undefined &&
      typeof config.authorize !== "function"
    ) {
      throw new Error(
        "strapi-plugin-draft-preview: authorize must be a function",
      );
    }

    if (
      config.requireAuth !== undefined &&
      !validRequireAuth.has(config.requireAuth)
    ) {
      throw new Error(
        'strapi-plugin-draft-preview: requireAuth must be true, false, "api-token", or "admin"',
      );
    }

    if (
      config.guardNativeStatus !== undefined &&
      typeof config.guardNativeStatus !== "boolean"
    ) {
      throw new Error(
        "strapi-plugin-draft-preview: guardNativeStatus must be a boolean",
      );
    }
  },
};
