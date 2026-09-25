import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

// Azul vivo como color principal; naranja, cian y rosa identifican categorías
// (tipos de actividad y de evento). Rojo-rosa solo para atrasado/riesgo alto.
export const iconTint = { light: "#3468E1", dark: "#3A6EE6" } as const;

export const categoryColors = {
  light: { blue: "#3468E1", orange: "#F97316", cyan: "#22C3E6", pink: "#F43F5E", gray: "#94A3B8" },
  dark: { blue: "#3A6EE6", orange: "#FB923C", cyan: "#22D3EE", pink: "#FB7185", gray: "#64748B" },
} as const;

export type CategoryColor = keyof (typeof categoryColors)["light"];

export const statusColors = {
  light: { done: "#15803D", ongoing: "#F97316", overdue: "#E11D48" },
  dark: { done: "#4ADE80", ongoing: "#FB923C", overdue: "#FB7185" },
} as const;

const lightColors = {
  primary: "#3468E1",
  onPrimary: "#FFFFFF",
  primaryContainer: "#E7EEFF",
  onPrimaryContainer: "#0B2A6B",
  secondary: "#F97316",
  onSecondary: "#2A1000",
  // Paper pinta con secondaryContainer lo seleccionado (segmentados, chips):
  // se usa el azul suave del primario para que toda selección sea azul.
  secondaryContainer: "#E7EEFF",
  onSecondaryContainer: "#0B2A6B",
  tertiary: "#22C3E6",
  onTertiary: "#032B33",
  tertiaryContainer: "#DDF7FC",
  onTertiaryContainer: "#053A45",
  error: "#E11D48",
  onError: "#FFFFFF",
  errorContainer: "#FFE4EA",
  onErrorContainer: "#5C0A1E",
  background: "#F3F5F9",
  onBackground: "#111827",
  surface: "#FFFFFF",
  onSurface: "#111827",
  surfaceVariant: "#EEF1F6",
  onSurfaceVariant: "#5B6474",
  surfaceDisabled: "rgba(17, 24, 39, 0.12)",
  onSurfaceDisabled: "rgba(17, 24, 39, 0.38)",
  outline: "#9AA3B2",
  outlineVariant: "#E6E9F0",
  inverseSurface: "#111827",
  inverseOnSurface: "#F3F5F9",
  inversePrimary: "#93B4FF",
  shadow: "#1E293B",
  scrim: "#000000",
  backdrop: "rgba(17, 24, 39, 0.40)",
  elevation: {
    level0: "transparent",
    level1: "#FFFFFF",
    level2: "#FFFFFF",
    level3: "#FAFBFD",
    level4: "#F7F8FB",
    level5: "#F3F5F9",
  },
} satisfies MD3Theme["colors"];

const darkColors = {
  primary: "#3A6EE6",
  onPrimary: "#FFFFFF",
  primaryContainer: "#1D3563",
  onPrimaryContainer: "#DCE8FF",
  secondary: "#FB923C",
  onSecondary: "#2A1000",
  secondaryContainer: "#1D3563",
  onSecondaryContainer: "#DCE8FF",
  tertiary: "#22D3EE",
  onTertiary: "#032B33",
  tertiaryContainer: "#0E3E48",
  onTertiaryContainer: "#CFF6FC",
  error: "#FB7185",
  onError: "#3F0715",
  errorContainer: "#5A1426",
  onErrorContainer: "#FFE4EA",
  background: "#121216",
  onBackground: "#F3F4F6",
  surface: "#1E1E24",
  onSurface: "#F3F4F6",
  surfaceVariant: "#28282F",
  onSurfaceVariant: "#A1A7B3",
  surfaceDisabled: "rgba(243, 244, 246, 0.12)",
  onSurfaceDisabled: "rgba(243, 244, 246, 0.38)",
  outline: "#6B7280",
  outlineVariant: "#2E2E36",
  inverseSurface: "#F3F4F6",
  inverseOnSurface: "#1E1E24",
  inversePrimary: "#3468E1",
  shadow: "#000000",
  scrim: "#000000",
  backdrop: "rgba(0, 0, 0, 0.60)",
  elevation: {
    level0: "transparent",
    level1: "#1E1E24",
    level2: "#222229",
    level3: "#26262D",
    level4: "#2A2A31",
    level5: "#2E2E36",
  },
} satisfies MD3Theme["colors"];

// DM Sans registrada como familia nativa en Android (res/font/dm_sans.xml),
// así fontWeight elige el archivo correcto sin negrita sintética.
const fonts = configureFonts({
  config: { fontFamily: "DM Sans" },
});
fonts.headlineMedium = { ...fonts.headlineMedium, fontWeight: "700" };
fonts.headlineLarge = { ...fonts.headlineLarge, fontWeight: "700" };

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 2.4, // ×5 en botones y segmentados = layout.cardRadius (12)
  colors: lightColors,
  fonts,
};
export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 2.4, // ×5 en botones y segmentados = layout.cardRadius (12)
  colors: darkColors,
  fonts,
};
