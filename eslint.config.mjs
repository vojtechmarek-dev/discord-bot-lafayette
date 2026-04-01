import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: ["dist/**", "node_modules/**"],
	},
	{
		...js.configs.recommended,
		files: ["**/*.js"],
		rules: {
			"no-unused-vars": "warn",
			semi: ["error", "always"],
			"no-console": "off",
			"prefer-const": "error",
			indent: ["error", "tab"],
		},
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			semi: ["error", "always"],
			"no-console": "off",
			"prefer-const": "error",
			indent: "off",
			"no-undef": "off",
		},
	},
]);
