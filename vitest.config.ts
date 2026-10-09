import path from "node:path";
import { defineConfig } from "vitest/config";

// Base de test ISOLEE : jamais la base de demonstration.
const TEST_DATABASE_URL =
  "postgresql://cybertrace:CyberTrace2026@127.0.0.1:5432/cybertrace_test";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    globalSetup: ["tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Fichiers sequentiels : les tests d'integration partagent la meme base
    // et font un nettoyage large (deleteMany) — parallelisme = flaky.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      STORAGE_KEY: "i0t29mKHdX2etYFlLgspdcoj+RI7FbJnLw7+KCz+jTg=",
      STORAGE_DIR: path.resolve(import.meta.dirname, "storage-test"),
    },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
