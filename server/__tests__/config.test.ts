import { describe, expect, it } from "vitest";
import config, { defaultConfig } from "../config";

describe("config", () => {
  it("exposes a default config matching the documented header contract", () => {
    expect(defaultConfig).toEqual({
      headerName: "x-include-drafts",
      expectedHeaderValue: "true",
      statusValue: "draft",
    });
  });

  describe("validator", () => {
    it("accepts an empty config (all defaults)", () => {
      expect(() => config.validator({})).not.toThrow();
    });

    it("accepts overrides matching the schema", () => {
      expect(() =>
        config.validator({
          headerName: "x-strapi-preview",
          expectedHeaderValue: "1",
          statusValue: "draft",
        }),
      ).not.toThrow();
    });

    it("rejects a non-string headerName", () => {
      expect(() =>
        // @ts-expect-error — purposefully invalid
        config.validator({ headerName: 42 }),
      ).toThrow(/headerName must be a string/);
    });

    it("rejects a non-string expectedHeaderValue", () => {
      expect(() =>
        // @ts-expect-error — purposefully invalid
        config.validator({ expectedHeaderValue: true }),
      ).toThrow(/expectedHeaderValue must be a string/);
    });

    it("rejects a non-string statusValue", () => {
      expect(() =>
        // @ts-expect-error — purposefully invalid
        config.validator({ statusValue: ["draft"] }),
      ).toThrow(/statusValue must be a string/);
    });
  });
});
