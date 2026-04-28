import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/__tests__/**", "server/index.ts", "server/register.ts"],
    },
  },
});
