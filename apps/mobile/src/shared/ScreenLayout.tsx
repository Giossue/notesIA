import type { ReactNode } from "react";
import { ScrollView, type ScrollViewProps, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout } from "@/core/theme/layout";
import { FloatingNavBar, type MainTab } from "@/navigation/FloatingNavBar";

export function ScreenLayout({
  children,
  tab,
  keyboardShouldPersistTaps,
}: {
  children: ReactNode;
  tab?: MainTab;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
}) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={[styles.content, tab ? styles.tabContent : styles.detailContent]}
      >
        {children}
      </ScrollView>
      {tab && <FloatingNavBar active={tab} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, gap: layout.sectionGap, padding: layout.pagePadding },
  tabContent: { paddingBottom: layout.tabClearance },
  detailContent: { paddingBottom: layout.pagePadding },
});
