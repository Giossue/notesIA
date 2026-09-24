module.exports = {
  preset: "@react-native/jest-preset",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(.bun|(jest-)?react-native|@react-native(-community)?|@react-navigation/.*|react-navigation|react-native-paper|react-native-safe-area-context|@testing-library/.*))",
  ],
};
