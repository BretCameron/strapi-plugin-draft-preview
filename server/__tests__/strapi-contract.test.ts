import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract tests against @strapi/plugin-graphql internals.
 *
 * The plugin works by hooking the same `willResolveField` lifecycle that
 * Strapi uses to capture `contextValue.rootQueryArgs` for relation populates.
 * If a Strapi upgrade renames or removes either piece, our plugin silently
 * stops working.
 *
 * These tests read the installed @strapi/plugin-graphql source and assert
 * the symbols we depend on still exist. They're cheap, run on the unit-test
 * timetable, and catch the class of upstream change that the integration
 * suite would otherwise have to detect.
 */

const repoRoot = resolve(__dirname, "../..");
const strapiGraphqlDist = resolve(
  repoRoot,
  "node_modules/@strapi/plugin-graphql/dist/server",
);
const bootstrapPath = resolve(strapiGraphqlDist, "bootstrap.js");
const associationPath = resolve(
  strapiGraphqlDist,
  "services/builders/resolvers/association.js",
);
const utilsPath = resolve(strapiGraphqlDist, "services/builders/utils.js");

describe("@strapi/plugin-graphql contract", () => {
  it("exposes a bootstrap module at the expected path", () => {
    expect(existsSync(bootstrapPath)).toBe(true);
  });

  it("captures rootQueryArgs in willResolveField at boot", () => {
    const bootstrap = readFileSync(bootstrapPath, "utf8");

    expect(
      bootstrap,
      "Strapi's bootstrap should still register a willResolveField plugin that " +
        "captures rootQueryArgs. If this fails, Strapi has changed how root args " +
        "are propagated to relation populates and our plugin's contract is broken.",
    ).toMatch(/willResolveField/);

    expect(bootstrap).toMatch(/rootQueryArgs/);
  });

  it("merges apolloServer.plugins from user config (where we register)", () => {
    const bootstrap = readFileSync(bootstrapPath, "utf8");

    expect(
      bootstrap,
      "We register our plugin via plugin::graphql.apolloServer.plugins. If Strapi " +
        "stops merging that config into Apollo Server, our plugin won't load.",
    ).toMatch(/apolloServer/);
  });

  it("association resolver reads rootQueryArgs to inherit status into populates", () => {
    const association = readFileSync(associationPath, "utf8");

    expect(
      association,
      "The association resolver inherits status from rootQueryArgs when " +
        "populating relations. If this stops being true, draft populates won't " +
        "work even if we set rootQueryArgs.status — the populate path needs to " +
        "actually consume it.",
    ).toMatch(/rootQueryArgs/);

    expect(association).toMatch(/status/);
  });

  it("getContentTypeArgs declares a status arg on collection types", () => {
    const utils = readFileSync(utilsPath, "utf8");

    expect(
      utils,
      "Built-in queries on draft+publish content types include a status arg. " +
        "Our plugin keys off the field definition having an arg named 'status'.",
    ).toMatch(/PublicationStatusArg/);
  });
});
