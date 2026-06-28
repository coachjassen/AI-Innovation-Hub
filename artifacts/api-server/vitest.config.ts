import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // These integration tests hit a single shared Postgres dev DB and create
    // real rows, so they must not run concurrently with one another.
    fileParallelism: false,
  },
});
