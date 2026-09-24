import { StyleSheet } from "react-native";

export const layout = {
  pagePadding: 20,
  tabClearance: 108,
  sectionGap: 24,
  itemGap: 8,
  fieldGap: 8,
  cardPadding: 20,
  cardRadius: 20,
  choiceRadius: 20,
  profileRadius: 24,
  smallRadius: 12,
  minTouch: 48,
  iconSize: 22,
  navInset: 18,
  navRadius: 34,
  navTabRadius: 28,
  navTabHeight: 56,
} as const;

export const sharedStyles = StyleSheet.create({
  listItem: { gap: layout.itemGap, minHeight: 72 },
  formFields: { gap: layout.fieldGap },
  actionContent: { minHeight: layout.minTouch },
});
