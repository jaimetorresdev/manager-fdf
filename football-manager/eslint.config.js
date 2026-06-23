import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const i18nLiteralRule = {
  'no-restricted-syntax': [
    'warn',
    {
      selector: 'JSXText[value=/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/]',
      message: 'User-visible JSX text should use i18n (t()).',
    },
  ],
}

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', 'server/**', 'engine/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
  // Playwright specs run in Node, not the browser bundle.
  {
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Vite config and build scripts (Node).
  {
    files: ['vite.config.ts', 'scripts/**/*.{js,ts,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Anti-literals for user-facing React (pages + shared UI).
  {
    files: [
      'src/pages/**/*.{tsx,ts}',
      'src/components/**/*.{tsx,ts}',
    ],
    ignores: [
      'src/components/match/**',
      'src/components/player/**',
      'src/components/tactics2/**',
      'src/components/economy/**',
      'src/components/calendar/**',
      'src/components/hub/**',
      'src/components/dashboard/**',
      'src/components/market/**',
      'src/components/training/**',
      'src/components/tactics/**',
    ],
    rules: i18nLiteralRule,
  },
])
