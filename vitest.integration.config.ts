import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    setupFiles: ["./tests/integration/setup-unhandled-rejection.ts"],
    // Strapi v5's admin plugin destroy throws when serveAdminPanel is false
    // (conditionProvider isn't registered). The throw happens in a SIGTERM/
    // SIGINT handler outside our test code, so our afterAll catch can't reach
    // it. The actual tests pass cleanly — this just suppresses the noise.
    dangerouslyIgnoreUnhandledErrors: true,
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--experimental-vm-modules"],
      },
    },
    server: {
      deps: {
        inline: [/^@strapi\//],
      },
    },
    env: {
      NODE_ENV: "test",
    },
  },
});
