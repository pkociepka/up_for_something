/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/e2e/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'ES2020',
        module: 'CommonJS',
        moduleResolution: 'Node',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        baseUrl: '.',
        paths: { '@/*': ['./*'] },
      },
    },
  },
  testTimeout: 30000,
  setupFiles: ['<rootDir>/e2e/setup-env.js'],
};

module.exports = config;
