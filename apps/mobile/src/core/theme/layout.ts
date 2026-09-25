import { StyleSheet } from "react-native";

export const layout = {
  pagePadding: 20,
  tabClearance: 128,
  sectionGap: 24,
  itemGap: 8,
  fieldGap: 8,
  cardPadding: 20,
  cardRadius: 12,
  choiceRadius: 12,
  profileRadius: 12,
  smallRadius: 8,
  minTouch: 48,
  iconSize: 22,
  navInset: 18,
  navRadius: 16,
  // Panel del encabezado: esquinas inferiores más amplias que las tarjetas.
  panelRadius: 28,
  navTabRadius: 10,
  navTabHeight: 56,
} as const;

export const sharedStyles = StyleSheet.create({
  listItem: { gap: layout.itemGap, minHeight: 72 },
  formFields: { gap: layout.fieldGap },
  actionContent: { minHeight: layout.minTouch },
});
