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
			...tseslint.configs.recommended.rules,
			semi: ["error", "always"],
			"no-console": "off",
			"prefer-const": "error",
			indent: "off",
			"no-undef": "off",
			// Catches the unused imports that previously passed CI. `execute(interaction,
			// client)` legitimately ignores `client` in most commands, hence the
			// underscore escape hatch rather than disabling the rule.
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					args: "after-used",
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrors: "none",
				},
			],
			// The codebase uses `catch (error: any)` and a few deliberate casts.
			// Tightening these is a separate pass, not part of the correctness fixes.
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
]);
