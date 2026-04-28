module.exports = ({ env }) => ({
  host: env("HOST", "127.0.0.1"),
  port: Number(env("PORT", "1338")),
  app: {
    keys: ["test-key-1", "test-key-2"],
  },
  url: env("PUBLIC_URL", "http://127.0.0.1:1338"),
});
