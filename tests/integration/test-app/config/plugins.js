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
    ...(process.env.DRAFT_PREVIEW_REQUIRE_AUTH
      ? { config: { requireAuth: true } }
      : {}),
  },
});
