import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Person 4's code imports via the "@/..." alias (e.g. "@/src/types").
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Runtime (Person 1), evaluation (Person 3) and control-plane (Person 4)
    // suites all use *.test.ts. Person 2's repair-engine suites use *.tests.ts
    // and run under node:test, so vitest intentionally skips them.
    include: ["tests/**/*.test.ts"],
    globals: true,
    environment: "node",
  },
});
