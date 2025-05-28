import js from "@eslint/js";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        files: ["**/*.js"],
        plugins: {
            js,
        },
        extends: ["js/recommended"],
        rules: {
            "no-unused-vars": "warn",
            semi: ['error', 'always'],
            'no-console': 'off',
            'prefer-const': 'error',
            indent: ['error', 'tab'],
        },
    },
]);