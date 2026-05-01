process.env.DRAFT_PREVIEW_AUTHORIZE_MODE = "role-editor";
process.env.PORT = "1340";

import type { Core } from "@strapi/strapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const cjsRequire = createRequire(__filename);

const APP_DIR = resolve(__dirname, "test-app");
const PORT = 1340;
const REST_BASE = `http://127.0.0.1:${PORT}/api`;

interface ArticleResponse {
  data: { documentId: string; title: string };
}

interface UsersPermissionsRole {
  id: number | string;
  type: string;
  permissions: Record<string, unknown>;
}

let strapiInstance: Core.Strapi;
let apiToken: string;
let articleDocumentId: string;

const rest = async <T = unknown>(
  path: string,
  headers: Record<string, string> = {},
): Promise<T> => {
  const res = await fetch(`${REST_BASE}${path}`, { headers });

  if (!res.ok) {
    throw new Error(`REST ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as T;
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
  // succeed (required for the "no token → published" assertions).
  const roles = (await strapiInstance
    .service("plugin::users-permissions.role")
    .find()) as UsersPermissionsRole[];

  const publicRoleId = roles.find((r) => r.type === "public")?.id;
  if (publicRoleId === undefined) {
    throw new Error("public role not found in users-permissions");
  }

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

  // Issue an API token named "preview-test" — this matches the authorize
  // predicate: ctx.state?.auth?.credentials?.name === "preview-test".
  const created = await strapiInstance.service("admin::api-token").create({
    name: "preview-test",
    description: "integration test authorize token",
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

describe("authorize predicate gate (integration)", () => {
  it("token (matching name) + header → drafts (predicate returns true)", async () => {
    const data = await rest<ArticleResponse>(`/articles/${articleDocumentId}`, {
      Authorization: `Bearer ${apiToken}`,
      "x-include-drafts": "true",
    });

    expect(data.data.title).toMatch(/draft v2/);
  });

  it("token (matching name) + ?status=draft (no header) → drafts (predicate allows; native pass-through)", async () => {
    // The predicate allows the request. guardNativeStatus is set, but the
    // allow path leaves native status params intact — so ?status=draft is
    // passed through and Strapi serves the draft row.
    const data = await rest<ArticleResponse>(
      `/articles/${articleDocumentId}?status=draft`,
      { Authorization: `Bearer ${apiToken}` },
    );

    expect(data.data.title).toMatch(/draft v2/);
  });

  it("no token + ?status=draft → published (predicate returns false; guardNativeStatus rewrites)", async () => {
    // Without the token the predicate returns false. guardNativeStatus
    // rewrites the status param to 'published' before the controller acts.
    const data = await rest<ArticleResponse>(
      `/articles/${articleDocumentId}?status=draft`,
    );

    expect(data.data.title).toMatch(/draft v1/);
  });

  it("no token + header → published (predicate returns false; silent fallback)", async () => {
    const data = await rest<ArticleResponse>(`/articles/${articleDocumentId}`, {
      "x-include-drafts": "true",
    });

    expect(data.data.title).toMatch(/draft v1/);
  });
});
