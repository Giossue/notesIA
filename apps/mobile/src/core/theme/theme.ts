import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

// Neutral surfaces; blue is reserved for icon glyphs.
export const iconTint = { light: "#4F98FF", dark: "#4F98FF" } as const;

const lightColors = {
  primary: "#27333D",
  onPrimary: "#FFFFFF",
  primaryContainer: "#EFF1F2",
  onPrimaryContainer: "#27333D",
  secondary: "#365D4A",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#EFF1F2",
  onSecondaryContainer: "#27333D",
  tertiary: "#76593D",
  onTertiary: "#FFFFFF",
  tertiaryContainer: "#EFF1F2",
  onTertiaryContainer: "#27333D",
  error: "#BA1A1A",
  onError: "#FFFFFF",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#410002",
  background: "#FAFAF9",
  onBackground: "#18212A",
  surface: "#FFFFFF",
  onSurface: "#18212A",
  surfaceVariant: "#F3F4F4",
  onSurfaceVariant: "#4D5962",
  surfaceDisabled: "rgba(24, 33, 42, 0.12)",
  onSurfaceDisabled: "rgba(24, 33, 42, 0.38)",
  outline: "#717981",
  outlineVariant: "#E1E4E5",
  inverseSurface: "#27333D",
  inverseOnSurface: "#F3F5F6",
  inversePrimary: "#DCE3E6",
  shadow: "#000000",
  scrim: "#000000",
  backdrop: "rgba(24, 33, 42, 0.40)",
  elevation: {
    level0: "transparent",
    level1: "#F8F8F7",
    level2: "#F4F5F4",
    level3: "#F0F2F1",
    level4: "#ECEFEE",
    level5: "#E8ECEA",
  },
} satisfies MD3Theme["colors"];

const darkColors = {
  primary: "#E2E7EA",
  onPrimary: "#182126",
  primaryContainer: "#30373B",
  onPrimaryContainer: "#F2F4F5",
  secondary: "#B6D8C2",
  onSecondary: "#163322",
  secondaryContainer: "#30373B",
  onSecondaryContainer: "#F2F4F5",
  tertiary: "#DBC4A6",
  onTertiary: "#3F2C18",
  tertiaryContainer: "#30373B",
  onTertiaryContainer: "#F2F4F5",
  error: "#FFB4AB",
  onError: "#690005",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",
  background: "#0E1113",
  onBackground: "#F2F7FA",
  surface: "#1B1F22",
  onSurface: "#F2F7FA",
  surfaceVariant: "#292E32",
  onSurfaceVariant: "#CDD3D6",
  surfaceDisabled: "rgba(242, 247, 250, 0.12)",
  onSurfaceDisabled: "rgba(242, 247, 250, 0.38)",
  outline: "#AAB3B8",
  outlineVariant: "#3E454A",
  inverseSurface: "#F2F7FA",
  inverseOnSurface: "#1B1F22",
  inversePrimary: "#27333D",
  shadow: "#000000",
  scrim: "#000000",
  backdrop: "rgba(0, 0, 0, 0.55)",
  elevation: {
    level0: "transparent",
    level1: "#1B1F22",
    level2: "#22272A",
    level3: "#292E32",
    level4: "#2D3337",
    level5: "#32383C",
  },
} satisfies MD3Theme["colors"];

const fonts = configureFonts({
  config: {
    headlineMedium: {
      ...MD3LightTheme.fonts.headlineMedium,
      fontWeight: "700",
    },
  },
});

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: lightColors,
  fonts,
};
export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 4,
  colors: darkColors,
  fonts,
};
