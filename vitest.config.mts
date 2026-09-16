import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Vitest ran without a config until now, which worked only because every test
// imported its subject relatively and the few `@/…` imports underneath were
// type-only — erased before Node ever saw them.
//
// validateDiscount imports real values from `@/lib/promo-offer`, so the alias
// has to resolve at runtime too. This mirrors the single `paths` entry in
// tsconfig.json; nothing else about the default setup is changed.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
});
