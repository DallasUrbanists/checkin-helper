import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        process: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Intl: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
      }
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      vue
    },
    rules: {
      ...vue.configs.essential.rules
    }
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/**', 'dist/**']
  }
];
