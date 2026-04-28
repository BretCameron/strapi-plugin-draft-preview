---
"strapi-plugin-include-drafts": minor
---

Initial release. Strapi v5 plugin that injects `status: "draft"` into GraphQL queries when an HTTP header is set, working around the `rootQueryArgs` populate quirk that breaks resolversConfig middleware approaches.

- Apollo Server plugin instead of resolversConfig middleware so the status reaches relation populates.
- Configurable header name, expected value, and status string.
- Honours an explicit `status` argument from the query AST.
- Skips fields without a `status` arg, so custom resolvers and non-draft-and-publish content types are untouched.
