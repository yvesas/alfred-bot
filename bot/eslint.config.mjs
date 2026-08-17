import eslintPluginPrettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // Ignore GLOBAL. No flat config, `ignores` dentro de um bloco que tem `files` só vale
  // para aquele bloco — não exclui os arquivos do resto da execução. Sem esta entrada
  // separada, o lint entra em `dist/` e `coverage/` e falha na máquina de quem já
  // buildou (no CI passava porque o checkout é limpo).
  { ignores: ["node_modules/**", "dist/**", "coverage/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: eslintPluginPrettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...eslintConfigPrettier.rules,
      "prettier/prettier": "error",
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
