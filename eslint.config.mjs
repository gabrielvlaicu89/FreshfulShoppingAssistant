import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "apps/*/dist/**",
      "apps/mobile/android/.gradle/**",
      "apps/mobile/android/app/build/**",
      "apps/mobile/android/build/**",
      "apps/mobile/.artifacts/**",
      "packages/*/dist/**",
      "packages/contracts/src/**/*.d.ts",
      "packages/contracts/src/**/*.js"
    ]
  },
  {
    files: ["**/*.{mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: globals.node
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
  }
);