import tseslint from 'typescript-eslint'
import unicorn from 'eslint-plugin-unicorn'
import prettier from 'eslint-plugin-prettier'

export default tseslint.config(
  {
    ignores: ['node_modules', 'dist', 'build']
  },

  // TypeScript recommended
  ...tseslint.configs.recommended,

  {
    plugins: {
      unicorn,
      prettier
    },

    rules: {
      /* ===========================
         TSLint rule parity
         =========================== */

      // file-name-casing: [true, "kebab-case"]
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase'
        }
      ],

      // ordered-imports: false
      'sort-imports': 'off',

      // object-literal-sort-keys: false
      'sort-keys': 'off',

      // arrow-parens: false
      'arrow-parens': 'off',

      // max-line-length: false
      'max-len': 'off',

      // no-shadowed-variable: false
      '@typescript-eslint/no-shadow': 'off',

      // member-ordering: false
      '@typescript-eslint/member-ordering': 'off',

      // interface-over-type-literal: false
      '@typescript-eslint/consistent-type-definitions': 'off',

      // array-type: false
      '@typescript-eslint/array-type': 'off',

      // only-arrow-functions: false
      '@typescript-eslint/prefer-function-type': 'off',

      // interface-name: false
      '@typescript-eslint/naming-convention': 'off',

      // object-literal-key-quotes: [true, "consistent-as-needed"]
      'quote-props': ['error', 'as-needed'],

      // forin: false
      'guard-for-in': 'off',

      // no-namespace: false
      '@typescript-eslint/no-namespace': 'off',

      /* ===========================
         Existing rule you had
         =========================== */

      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
