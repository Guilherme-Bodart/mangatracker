import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "contexts/auth-context.tsx",
        "components/auth/login-form.tsx",
        "components/auth/register-form.tsx",
        "lib/api-client.ts",
        "lib/manga-search-query.ts",
        "lib/profile-update.ts",
      ],
      exclude: ["**/*.test.{ts,tsx}"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
