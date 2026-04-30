process.env.DRAFT_PREVIEW_REQUIRE_AUTH = "true";
process.env.PORT = "1339";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const cjsRequire = createRequire(__filename);

const APP_DIR = resolve(__dirname, "test-app");
const PORT = 1339;
const REST_BASE = `http://127.0.0.1:${PORT}/api`;

let strapiInstance: any;
let apiToken: string;
let articleDocumentId: string;

const rest = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${REST_BASE}${path}`, { headers });

  if (!res.ok) {
    throw new Error(`REST ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as { data: any };
};

beforeAll(async () => {
  rmSync(resolve(APP_DIR, ".tmp"), { recursive: true, force: true });
  rmSync(resolve(APP_DIR, ".strapi"), { recursive: true, force: true });
  rmSync(resolve(APP_DIR, "dist"), { recursive: true, force: true });

  mkdirSync(resolve(APP_DIR, ".tmp"), { recursive: true });
  mkdirSync(resolve(APP_DIR, "public/uploads"), { recursive: true });

  const { createStrapi } = cjsRequire("@strapi/strapi");

  strapiInstance = await createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  }).load();

  await strapiInstance.start();

  // Grant public role read access on Article so unauthenticated requests
  // succeed (required for the "no token → published" assertion).
  const roles = await strapiInstance
    .service("plugin::users-permissions.role")
    .find();

  const publicRoleId = roles.find((r: any) => r.type === "public").id;

  const publicRole = await strapiInstance
    .service("plugin::users-permissions.role")
    .findOne(publicRoleId);

  await strapiInstance
    .service("plugin::users-permissions.role")
    .updateRole(publicRole.id, {
      ...publicRole,
      permissions: {
        ...publicRole.permissions,
        "api::article": {
          controllers: {
            article: {
              find: { enabled: true },
              findOne: { enabled: true },
            },
          },
        },
      },
    });

  // Seed: published v1, draft edit v2.
  const articleDoc = await strapiInstance
    .documents("api::article.article")
    .create({ data: { title: "Article (draft v1)" } });

  await strapiInstance
    .documents("api::article.article")
    .publish({ documentId: articleDoc.documentId });

  await strapiInstance.documents("api::article.article").update({
    documentId: articleDoc.documentId,
    data: { title: "Article (draft v2)" },
  });

  articleDocumentId = articleDoc.documentId;

  // Issue a read-only API token.
  const created = await strapiInstance.service("admin::api-token").create({
    name: "preview-test",
    description: "integration test preview token",
    type: "read-only",
    lifespan: null,
  });

  apiToken = created.accessKey;
}, 120_000);

afterAll(async () => {
  if (!strapiInstance) return;

  try {
    await strapiInstance.destroy();
  } catch (err) {
    // Strapi v5's admin plugin destroy throws when serveAdminPanel is false
    // because the conditionProvider service isn't registered. Swallow it.
    if (
      !(err instanceof TypeError) ||
      !err.message.includes("conditionProvider")
    ) {
      throw err;
    }
  }
}, 30_000);

describe("requireAuth gate (integration)", () => {
  it("token + header → drafts", async () => {
    const data = await rest(`/articles/${articleDocumentId}`, {
      Authorization: `Bearer ${apiToken}`,
      "x-include-drafts": "true",
    });

    expect(data.data.title).toMatch(/draft v2/);
  });

  it("no token + header → published (silent fallback)", async () => {
    const data = await rest(`/articles/${articleDocumentId}`, {
      "x-include-drafts": "true",
    });

    expect(data.data.title).toMatch(/draft v1/);
  });
});
