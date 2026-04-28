export interface PluginConfig {
  /** HTTP header that triggers draft injection. Defaults to `x-include-drafts`. */
  headerName: string;
  /** Header value treated as truthy. Defaults to `"true"`. */
  expectedHeaderValue: string;
  /** Status string to inject. Defaults to `"draft"`. */
  statusValue: string;
}

export const defaultConfig: PluginConfig = {
  headerName: "x-include-drafts",
  expectedHeaderValue: "true",
  statusValue: "draft",
};

export default {
  default: defaultConfig,
  validator(config: Partial<PluginConfig>) {
    if (config.headerName !== undefined && typeof config.headerName !== "string") {
      throw new Error("strapi-plugin-include-drafts: headerName must be a string");
    }

    if (
      config.expectedHeaderValue !== undefined &&
      typeof config.expectedHeaderValue !== "string"
    ) {
      throw new Error("strapi-plugin-include-drafts: expectedHeaderValue must be a string");
    }

    if (config.statusValue !== undefined && typeof config.statusValue !== "string") {
      throw new Error("strapi-plugin-include-drafts: statusValue must be a string");
    }
  },
};
