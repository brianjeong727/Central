import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import central from "./eslint/central-rules.mjs";

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
  // ── CommonJS tooling scripts: .cjs means require() by definition ─────────────
  // Node utility scripts (load-test harness, probes) are CommonJS on purpose so
  // they run outside the Next bundler; the ESM-import rule doesn't apply to them.
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // ── CLAUDE.md conventions as lint rules (eslint/central-rules.mjs) ───────────
  // Each rule is one numbered convention. Sanctioned exceptions are listed here
  // by file; a one-off nonconformer is disabled at its site with a reason.
  {
    files: ["app/**", "components/**", "lib/**", "proxy.ts", "capacitor.config.ts"],
    plugins: { central },
    rules: {
      "central/no-inline-role-array": "error",
      "central/visitor-parity": "error",
      "central/register-cta": "error",
      "central/action-menu-only": "error",
      "central/keyboard-inset": "error",
      "central/call-start-gate": "error",
    },
  },
  {
    // lib/roles.ts IS the role encoding (#2, #3).
    files: ["lib/roles.ts"],
    rules: {
      "central/no-inline-role-array": "off",
      "central/visitor-parity": "off",
    },
  },
  {
    // #20's sole exceptions: ActionMenu itself, and the frozen chat message menu.
    files: ["components/central/action-menu.tsx", "app/home/tabs/message-row.tsx"],
    rules: { "central/action-menu-only": "off" },
  },
  {
    // /register-ministry is the router #14 points everyone at; it alone links onward.
    files: ["app/register-ministry/**"],
    rules: { "central/register-cta": "off" },
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
