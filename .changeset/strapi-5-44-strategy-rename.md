---
"strapi-plugin-draft-preview": patch
---

Fix `requireAuth` gate on Strapi 5.44+. Strapi renamed its auth strategies (`api-token` → `content-api-token`, `admin` → `admin-token`) in 5.44, which caused the built-in auth check to silently deny valid tokens and fall back to published content. The gate now accepts both old and new strategy names, so the plugin works on Strapi 5.43 and 5.44+ without config changes.
