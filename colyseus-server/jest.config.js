module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // Colyseus 0.17 pulls in `rou3` (ESM-only, "type":"module", ships .mjs)
    // via @colyseus/core → @colyseus/better-call. Jest (CJS) can't require an
    // .mjs, so transpile it with ts-jest. isolatedModules skips type-checking
    // the vendored JS. Scoped to .mjs so plain .js CJS deps are untouched.
    '^.+\\.mjs$': ['ts-jest', { isolatedModules: true }],
  },
  // By default Jest ignores all of node_modules for transformation. Un-ignore
  // `rou3` (matched anywhere, incl. pnpm's .pnpm/rou3@x/node_modules/rou3 path)
  // so the .mjs transform above actually runs on it.
  transformIgnorePatterns: ['/node_modules/(?!.*rou3)'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/tests/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 50, // Realistic starting point
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testTimeout: 10000, // 10 seconds for physics tests
};
