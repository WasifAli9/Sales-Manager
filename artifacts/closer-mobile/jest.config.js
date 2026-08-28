const esModulePackages = [
  '(jest-)?react-native',
  '@react-native(/.*)?',
  '@react-native-community(/.*)?',
  'expo(-.*)?',
  '@expo(-.*)?',
  '@expo-google-fonts(/.*)?',
  '@unimodules(/.*)?',
  'unimodules',
  'sentry-expo',
  'native-base',
  'react-navigation',
  '@workspace',
].join('|');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  // pnpm stores real packages inside node_modules/.pnpm/<pkg>@ver/node_modules/<pkg>.
  // The first segment after node_modules/ is ".pnpm", not a package name, so a single
  // ignore-pattern bails out too early.  Two patterns fix this:
  //   1. For the pnpm virtual store: match the package name after the second node_modules/
  //   2. For direct installs: skip .pnpm so pattern 1 handles it
  transformIgnorePatterns: [
    `node_modules/.pnpm/(?!(${esModulePackages}))`,
    `node_modules/(?!(\\.pnpm|${esModulePackages}))`,
  ],
  moduleNameMapper: {
    // @testing-library/react-native v14 imports the bare specifier "test-renderer"
    '^test-renderer$': 'react-test-renderer',
    '^@/(.*)$': '<rootDir>/$1',
    '^@workspace/api-client-react$':
      '<rootDir>/__mocks__/@workspace/api-client-react.js',
  },
};
