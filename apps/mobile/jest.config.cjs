module.exports = {
  preset: "@react-native/jest-preset",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // El build ESM (.mjs) de Lucide no pasa por Babel en Jest; se usa el CommonJS.
    "^lucide-react-native$":
      "<rootDir>/../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(.bun|(jest-)?react-native|@react-native(-community)?|@react-navigation/.*|react-navigation|react-native-paper|react-native-safe-area-context|@testing-library/.*|uuid))",
  ],
};
