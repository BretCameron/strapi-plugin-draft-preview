module.exports = () => ({
  "users-permissions": {
    enabled: true,
    config: {
      jwtSecret: "test-jwt-secret",
    },
  },
  graphql: {
    enabled: true,
    config: {
      endpoint: "/graphql",
      shadowCRUD: true,
      generateArtifacts: false,
      playgroundAlways: false,
    },
  },
  "draft-preview": {
    enabled: true,
    ...(process.env.DRAFT_PREVIEW_AUTHORIZE_MODE === "role-editor"
      ? {
          config: {
            // Predicate exercised by the authorize integration test:
            // allow only when the request has a credentials.name === "preview-test"
            // (i.e. the test API token by name). guardNativeStatus on so we can
            // also exercise the native rewrite path through the authorize gate.
            authorize: (ctx) =>
              ctx.state?.auth?.credentials?.name === "preview-test",
            guardNativeStatus: true,
          },
        }
      : process.env.DRAFT_PREVIEW_REQUIRE_AUTH
        ? { config: { requireAuth: true, guardNativeStatus: true } }
        : {}),
  },
});
