module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  rules: {
    // Enforce no semicolons
    'semi': ['error', 'never'],
    '@typescript-eslint/semi': ['error', 'never'],
    
    // Additional style preferences
    'quotes': ['error', 'single'],
    'comma-dangle': ['error', 'always-multiline'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
  },
  env: {
    node: true,
    es6: true,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'generated/',
    'docs/',
  ],
}
