import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const WEB_STORAGE_MSG =
  "Convention #1: Supabase session only — never web storage.";
const LEAF_MSG =
  "components/central is a LEAF — no app/ imports (CLAUDE.md Key Files).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/pdf.worker.min.mjs",
  ]),
  // ── Convention #1: no web storage anywhere (Supabase session only) ──────────
  // Mechanizes the "never use localStorage/sessionStorage" rule so it can never
  // silently reappear. e2e/ and scripts/ use no web storage, so this is safe
  // globally (verified zero violations at introduction).
  {
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: WEB_STORAGE_MSG },
        { name: "sessionStorage", message: WEB_STORAGE_MSG },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "localStorage", message: WEB_STORAGE_MSG },
        { object: "window", property: "sessionStorage", message: WEB_STORAGE_MSG },
        { object: "globalThis", property: "localStorage", message: WEB_STORAGE_MSG },
        { object: "globalThis", property: "sessionStorage", message: WEB_STORAGE_MSG },
      ],
    },
  },
  // ── LEAF rule: components/central must not import from app/ ──────────────────
  // Mechanizes the CLAUDE.md Key Files invariant (central is a design-system
  // leaf; app/ depends on it, never the reverse). Any new app/ import here fails.
  {
    files: ["components/central/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/*", "**/app/**", "@/app/*", "@/app/**"],
              message: LEAF_MSG,
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
