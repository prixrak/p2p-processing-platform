/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.spec.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@p2p/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@p2p/config$': '<rootDir>/../../packages/config/src/index.ts',
    '^@p2p/prisma$': '<rootDir>/../../packages/prisma/src/index.ts',
  },
};
