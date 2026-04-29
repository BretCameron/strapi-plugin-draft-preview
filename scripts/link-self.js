#!/usr/bin/env node

/**
 * Strapi v5's plugin loader resolves plugin packages via Node's
 * `require("<pkg>/package.json")`. From inside a node_modules tree,
 * Node walks up looking for the package; for the integration test app
 * to find this plugin, it must be reachable from the plugin root's
 * node_modules.
 *
 * This script creates a symlink at `<root>/node_modules/<pkgName>` ->
 * `<root>`, so `require("strapi-plugin-draft-preview/...")` resolves
 * even when called from a sibling like `@strapi/core`. The symlink is
 * idempotent — re-running is a no-op.
 *
 * Only used in development and CI integration runs. Downstream consumers
 * who install this package via npm will never see this script.
 */

const { existsSync, lstatSync, mkdirSync, symlinkSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const pkgName = require(resolve(root, "package.json")).name;

const nodeModulesDir = resolve(root, "node_modules");
const linkPath = resolve(nodeModulesDir, pkgName);

mkdirSync(nodeModulesDir, { recursive: true });

if (existsSync(linkPath)) {
  const stat = lstatSync(linkPath);

  if (stat.isSymbolicLink()) {
    process.stdout.write(`[link-self] ${pkgName} symlink already exists\n`);
    process.exit(0);
  }

  process.stderr.write(
    `[link-self] ${linkPath} exists but is not a symlink — refusing to overwrite\n`,
  );
  process.exit(1);
}

symlinkSync("..", linkPath, "dir");
process.stdout.write(`[link-self] symlinked ${pkgName} -> ..\n`);
