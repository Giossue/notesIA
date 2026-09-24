import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";
import { darkTheme, lightTheme } from "@/core/theme/theme";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const textPairs = [
  ["primary", "onPrimary"],
  ["primaryContainer", "onPrimaryContainer"],
  ["secondary", "onSecondary"],
  ["secondaryContainer", "onSecondaryContainer"],
  ["tertiary", "onTertiary"],
  ["tertiaryContainer", "onTertiaryContainer"],
  ["surface", "onSurface"],
  ["surfaceVariant", "onSurfaceVariant"],
  ["background", "onBackground"],
  ["error", "onError"],
  ["errorContainer", "onErrorContainer"],
] as const;

test.each([
  ["claro", lightTheme, MD3LightTheme],
  ["oscuro", darkTheme, MD3DarkTheme],
] as const)("el tema %s tiene selección y acento propios con texto legible", (_, theme, paper) => {
  expect(theme.colors.secondaryContainer).not.toBe(paper.colors.secondaryContainer);
  expect(theme.colors.tertiary).not.toBe(paper.colors.tertiary);
  for (const [background, foreground] of textPairs) {
    expect(contrast(theme.colors[foreground], theme.colors[background])).toBeGreaterThanOrEqual(
      4.5,
    );
  }
});
