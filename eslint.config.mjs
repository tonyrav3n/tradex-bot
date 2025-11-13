import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import { importX } from 'eslint-plugin-import-x';
import globals from 'globals';

export default [
  // Recommended base configs
  js.configs.recommended,
  importX.flatConfigs.recommended,
  prettierConfig,

  // Main configuration
  {
    files: ['**/*.{js,mjs,cjs}'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    settings: {
      'import-x/resolver': {
        node: {
          extensions: ['.js', '.mjs', '.cjs'],
        },
      },
    },

    rules: {
      // Possible Problems
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'error',
      'no-console': 'off', // Allow console for Node.js apps
      'no-constant-condition': ['error', { checkLoops: false }],

      // Suggestions
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'prefer-destructuring': [
        'error',
        {
          array: false,
          object: true,
        },
      ],
      'no-lonely-if': 'error',
      'no-useless-return': 'error',

      // Layout & Formatting (Note: Prettier handles most of these)
      // Only keeping rules that don't conflict with Prettier

      // Import rules
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin', // Node.js built-in modules
            'external', // npm packages
            'internal', // Internal aliases
            'parent', // Parent imports
            'sibling', // Sibling imports
            'index', // Index imports
            'object', // Object imports
            'type', // Type imports
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/newline-after-import': ['error', { count: 1 }],
      'import-x/no-duplicates': 'error',
      'import-x/no-unresolved': [
        'error',
        {
          ignore: ['^node:'],
        },
      ],
      'import-x/named': 'error',
      'import-x/default': 'error',
      'import-x/namespace': 'error',
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'import-x/extensions': ['error', 'ignorePackages', { js: 'always' }],
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.min.js',
      '.git/',
    ],
  },
];
