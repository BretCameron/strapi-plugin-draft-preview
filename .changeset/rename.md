---
"strapi-plugin-draft-preview": major
---

Rename: published as `strapi-plugin-draft-preview`. The Strapi plugin key is now `"draft-preview"` instead of `"include-drafts"` in `config/plugins.js`. The HTTP header default stays `x-include-drafts` (it describes the request semantic, independent of package name).

Migrating from prior installs (only relevant if you used a pre-release):
- Update `npm install`'d package: `npm uninstall strapi-plugin-include-drafts && npm install strapi-plugin-draft-preview`
- Update `config/plugins.js`: `"include-drafts"` → `"draft-preview"`
