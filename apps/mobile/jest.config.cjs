module.exports = {
  preset: "react-native",
  setupFiles: ["react-native-gesture-handler/jestSetup"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/test/**/*.test.ts?(x)"],
  moduleNameMapper: {
    "^@env$": "<rootDir>/test/mocks/env.ts"
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|zustand|@tanstack/react-query)/)"
  ]
};