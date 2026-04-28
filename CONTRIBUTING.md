# Contributing

Thanks for taking an interest. This is a small plugin so the loop is short.

## Local setup

```sh
git clone https://github.com/BretCameron/strapi-plugin-include-drafts
cd strapi-plugin-include-drafts
npm install
```

## Tests

Two tiers — both run in CI.

```sh
npm run test:unit         # fast, isolated, ~300ms
npm run test:integration  # boots a real Strapi, ~3s
npm run test:coverage     # unit tests with coverage threshold (90%)
```

Integration tests live under `tests/integration/` and boot a minimal Strapi app from `tests/integration/test-app/`. The plugin itself is symlinked into `node_modules/` so Strapi's loader can find it via npm-style resolution — `npm run link-self` handles this and is run automatically by `test:integration`.

## Lint and format

```sh
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

CI runs both on every PR.

## Releases

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing.

When you make a user-facing change:

```sh
npx changeset
```

Pick the bump (patch / minor / major) and write a one-paragraph release note. Commit the generated `.changeset/*.md` alongside your code.

When the PR merges to `main`, the release workflow opens (or updates) a "Version Packages" PR. Merging _that_ PR publishes to npm.

Chore-only or docs-only changes don't need a changeset.

## What "watertight" means here

The plugin is small but takes load-bearing dependencies on Strapi internals (`rootQueryArgs`, the association resolver inheritance pattern). Three layers of tests guard against breakage:

1. **Unit tests** (`server/__tests__/`) cover the pure decision logic — what the plugin does given hypothetical inputs.
2. **Contract tests** (`server/__tests__/strapi-contract.test.ts`) read the installed `@strapi/plugin-graphql` source and assert the symbols we depend on still exist. Catches breaking upgrades cheaply.
3. **Integration tests** (`tests/integration/`) boot a real Strapi, seed draft+published content, hit `/graphql` with and without the header, and assert the response actually changes the way we expect.

CI runs the integration suite against multiple Strapi versions in matrix.

If you're adding a new behaviour, please cover it at all three levels where applicable.
