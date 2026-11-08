import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  { ignores: [".next/**", "next-env.d.ts", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { plugins: { "@next/next": next }, rules: { ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules } },
);
