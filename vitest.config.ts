import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runtime (Person 1) and evaluation (Person 3) suites both use *.test.ts.
    // Person 2's repair-engine suites use *.tests.ts and run under node:test,
    // so vitest intentionally does not pick them up.
    include: ["tests/**/*.test.ts"],
    // Person 3's suites rely on global describe/it/expect.
    globals: true,
    environment: "node",
  },
});
