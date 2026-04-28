import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
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
  },
});
