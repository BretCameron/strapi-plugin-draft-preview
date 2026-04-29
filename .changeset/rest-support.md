---
"strapi-plugin-draft-preview": minor
---

Add REST API support. The same `x-include-drafts` header now works on both REST (`GET /api/...`) and GraphQL endpoints. A Koa middleware injects `status=draft` into the request's query string for any request under the configured API prefix when the header is set, leaving Admin and GraphQL routes untouched.
