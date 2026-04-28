module.exports = () => ({
  auth: {
    secret: "test-admin-jwt-secret",
  },
  apiToken: {
    salt: "test-api-token-salt",
  },
  transfer: {
    token: {
      salt: "test-transfer-token-salt",
    },
  },
  flags: {
    nps: false,
    promoteEE: false,
  },
});
