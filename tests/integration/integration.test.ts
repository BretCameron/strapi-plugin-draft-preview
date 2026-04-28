import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

// Use Node's CJS resolver for @strapi/strapi. Strapi v5's ESM build does a
// directory import of lodash/fp which Node's strict ESM resolver refuses;
// the CJS build resolves the same module fine.
const cjsRequire = createRequire(__filename);

const APP_DIR = resolve(__dirname, "test-app");
const PORT = 1338;
const ENDPOINT = `http://127.0.0.1:${PORT}/graphql`;

let strapiInstance: any;

const seedData = async () => {
  // Create a section, publish it, then update its draft so the draft and
  // published rows have different content (and different internal row ids).
  const sectionDoc = await strapiInstance
    .documents("api::section.section")
    .create({
      data: { name: "Section (draft v1)" },
    });

  await strapiInstance
    .documents("api::section.section")
    .publish({ documentId: sectionDoc.documentId });

  await strapiInstance.documents("api::section.section").update({
    documentId: sectionDoc.documentId,
    data: { name: "Section (draft v2)" },
  });

  // Article points at that section, also published with a draft edit.
  const articleDoc = await strapiInstance
    .documents("api::article.article")
    .create({
      data: {
        title: "Article (draft v1)",
        section: sectionDoc.documentId,
      },
    });

  await strapiInstance
    .documents("api::article.article")
    .publish({ documentId: articleDoc.documentId });

  await strapiInstance.documents("api::article.article").update({
    documentId: articleDoc.documentId,
    data: { title: "Article (draft v2)" },
  });

  return { articleDocumentId: articleDoc.documentId };
};

const gql = async (query: string, headers: Record<string, string> = {}) => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { data?: any; errors?: unknown };

  expect(json.errors, JSON.stringify(json.errors)).toBeUndefined();

  return json.data;
};

let articleDocumentId: string;

beforeAll(async () => {
  rmSync(resolve(APP_DIR, ".tmp"), { recursive: true, force: true });
  rmSync(resolve(APP_DIR, ".strapi"), { recursive: true, force: true });
  rmSync(resolve(APP_DIR, "dist"), { recursive: true, force: true });

  mkdirSync(resolve(APP_DIR, ".tmp"), { recursive: true });
  mkdirSync(resolve(APP_DIR, "public/uploads"), { recursive: true });

  const { createStrapi } = cjsRequire("@strapi/strapi");

  // distDir == appDir because the test app uses .js files only — no
  // TypeScript compilation step. Strapi reads configs from <distDir>/config.
  strapiInstance = await createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  }).load();

  await strapiInstance.start();

  ({ articleDocumentId } = await seedData());
}, 120_000);

afterAll(async () => {
  if (!strapiInstance) return;

  try {
    await strapiInstance.destroy();
  } catch (err) {
    // Strapi v5's admin plugin destroy throws when serveAdminPanel is false
    // because the conditionProvider service isn't registered. Doesn't affect
    // test results — swallowing here keeps the unhandled-rejection warning
    // from polluting CI output.
    if (
      !(err instanceof TypeError) ||
      !err.message.includes("conditionProvider")
    ) {
      throw err;
    }
  }
}, 30_000);

describe("integration: x-include-drafts header", () => {
  it("returns published article and section without the header", async () => {
    const data = await gql(`{
      article(documentId: "${articleDocumentId}") {
        title
        publishedAt
        section { documentId name }
      }
    }`);

    expect(data.article.publishedAt).not.toBeNull();
    expect(data.article.title).toBe("Article (draft v1)");
    expect(data.article.section).not.toBeNull();
    expect(data.article.section.name).toBe("Section (draft v1)");
  });

  it("returns draft article and DRAFT section when the header is set", async () => {
    const data = await gql(
      `{
        article(documentId: "${articleDocumentId}") {
          title
          publishedAt
          section { documentId name }
        }
      }`,
      { "x-include-drafts": "true" },
    );

    expect(data.article.publishedAt).toBeNull();
    expect(data.article.title).toBe("Article (draft v2)");
    expect(
      data.article.section,
      "Relations on the draft side must populate. If section is null, the " +
        "rootQueryArgs propagation is broken — the plugin failed to update " +
        "rootQueryArgs.status, OR Strapi's association resolver no longer " +
        "inherits from rootQueryArgs.",
    ).not.toBeNull();
    expect(data.article.section.name).toBe("Section (draft v2)");
  });

  it("section.publishedAt is null in draft mode (proves populate followed status)", async () => {
    // Strapi v5 hides the internal row id via GraphQL (only documentId is
    // exposed, and documentId is shared between draft and published).
    // section.publishedAt is the cleanest observable proof: the published
    // row has a timestamp, the draft row has null. If the plugin failed to
    // propagate status to the relation populate, draft mode would return
    // the published section and publishedAt would be non-null.
    const draft = await gql(
      `{
        article(documentId: "${articleDocumentId}") {
          section { publishedAt }
        }
      }`,
      { "x-include-drafts": "true" },
    );

    expect(draft.article.section.publishedAt).toBeNull();
  });

  it("honours an explicit status: PUBLISHED in the query even when header is set", async () => {
    const data = await gql(
      `{
        article(documentId: "${articleDocumentId}", status: PUBLISHED) {
          publishedAt
          title
        }
      }`,
      { "x-include-drafts": "true" },
    );

    expect(data.article.publishedAt).not.toBeNull();
    expect(data.article.title).toBe("Article (draft v1)");
  });

  it("returns drafts on a list query with the header", async () => {
    const data = await gql(
      `{
        articles(pagination: { limit: 5 }) {
          documentId
          publishedAt
          section { documentId name }
        }
      }`,
      { "x-include-drafts": "true" },
    );

    expect(data.articles.length).toBeGreaterThan(0);

    for (const article of data.articles) {
      expect(article.publishedAt).toBeNull();
      expect(article.section).not.toBeNull();
    }
  });
});
