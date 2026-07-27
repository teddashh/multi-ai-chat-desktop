import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'refs', 'src-tauri/gen', 'src-tauri/target', '.orchestration'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Preserve the pre-v7 lint contract. react-hooks v7 folds optional
      // React Compiler rules into "recommended"; adopting those is a separate
      // refactor from this security-only toolchain update.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // New in ESLint 10's recommended set; enabling it requires an unrelated
      // executor cleanup and is intentionally deferred.
      'no-useless-assignment': 'off',
      // Keep this dependency-only security update from expanding the existing
      // lint contract with ESLint 10's newly recommended rules.
      'no-unassigned-vars': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@tauri-apps/*'], message: 'Import Tauri APIs only from src/host.' }],
        },
      ],
    },
  },
  {
    files: ['src/host/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
