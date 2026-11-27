import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/nova_ops_test`,
      DIRECT_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/nova_ops_test`,
      MOCK_API_BASE_URL: "http://127.0.0.1:8799",
      MOCK_API_TIMEOUT_MS: "2000",
    },
  },
});
