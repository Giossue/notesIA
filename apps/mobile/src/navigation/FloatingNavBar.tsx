import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FAB, Icon, Portal, Surface, Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";
import { iconTint } from "@/core/theme/theme";
import type { RootStackParamList } from "./types";

export type MainTab = "Home" | "Agenda" | "Activities" | "Events";

const tabs: {
  route: MainTab;
  label: string;
  icon: string;
  selectedIcon: string;
}[] = [
  {
    route: "Home",
    label: "Inicio",
    icon: "home-outline",
    selectedIcon: "home",
  },
  {
    route: "Agenda",
    label: "Agenda",
    icon: "calendar-blank-outline",
    selectedIcon: "calendar",
  },
  {
    route: "Activities",
    label: "Tareas",
    icon: "checkbox-marked-outline",
    selectedIcon: "checkbox-marked",
  },
  {
    route: "Events",
    label: "Eventos",
    icon: "bell-outline",
    selectedIcon: "bell",
  },
];

export function FloatingNavBar({ active }: { active: MainTab }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const iconColor = iconTint[theme.dark ? "dark" : "light"];
  const [createOpen, setCreateOpen] = useState(false);

  const renderTab = (tab: (typeof tabs)[number]) => {
    const selected = active === tab.route;
    const color = selected ? theme.colors.primary : theme.colors.onSurfaceVariant;
    return (
      <TouchableRipple
        key={tab.route}
        onPress={() => {
          if (!selected) {
            navigation.reset({
              index: tab.route === "Home" ? 0 : 1,
              routes:
                tab.route === "Home" ? [{ name: "Home" }] : [{ name: "Home" }, { name: tab.route }],
            });
          }
        }}
        borderless
        style={[styles.tab, selected && { backgroundColor: theme.colors.surfaceVariant }]}
        rippleColor="transparent"
        underlayColor="transparent"
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={`Ir a ${tab.label}`}
      >
        <View style={styles.tabContent}>
          <Icon
            source={selected ? tab.selectedIcon : tab.icon}
            color={iconColor}
            size={layout.iconSize}
          />
          <Text variant="labelSmall" numberOfLines={1} style={[styles.label, { color }]}>
            {tab.label}
          </Text>
        </View>
      </TouchableRipple>
    );
  };

  const actions = [
    {
      icon: "format-list-checks",
      label: "Nueva tarea",
      route: "ActivityForm" as const,
    },
    {
      icon: "book-outline",
      label: "Nueva materia",
      route: "SubjectForm" as const,
    },
    {
      icon: "calendar-plus",
      label: "Nuevo evento",
      route: "EventForm" as const,
    },
  ];

  return (
    <>
      <Surface
        elevation={0}
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
            elevation: 0,
            shadowColor: "transparent",
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
        accessibilityLabel="Navegación principal"
      >
        <View style={styles.row}>
          {tabs.slice(0, 2).map(renderTab)}
          <View style={styles.fabSpace}>
            <FAB
              icon={createOpen ? "close" : "plus"}
              accessibilityLabel="Crear"
              accessibilityState={{ expanded: createOpen }}
              color={theme.colors.onPrimary}
              style={[styles.mainFab, { backgroundColor: iconColor }]}
              onPress={() => setCreateOpen((open) => !open)}
            />
          </View>
          {tabs.slice(2).map(renderTab)}
        </View>
      </Surface>
      {createOpen && (
        <Portal>
          <Pressable
            style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }]}
            onPress={() => setCreateOpen(false)}
            accessibilityLabel="Cerrar"
          />
          <Surface
            elevation={0}
            style={[
              styles.menu,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            {actions.map((action) => (
              <TouchableRipple
                key={action.route}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                rippleColor={theme.colors.surfaceVariant}
                style={styles.action}
                onPress={() => {
                  setCreateOpen(false);
                  navigation.navigate(action.route, {});
                }}
              >
                <View style={styles.actionContent}>
                  <Icon source={action.icon} size={layout.iconSize} color={iconColor} />
                  <Text variant="bodyLarge">{action.label}</Text>
                </View>
              </TouchableRipple>
            ))}
          </Surface>
        </Portal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    alignSelf: "center",
    width: "88%",
    maxWidth: 360,
    bottom: 14,
    borderRadius: layout.navRadius,
    borderWidth: 1,
    padding: 5,
  },
  row: { width: "100%", flexDirection: "row", alignItems: "center" },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.navTabHeight,
    borderRadius: layout.navTabRadius,
    justifyContent: "center",
  },
  tabContent: {
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  fabSpace: {
    width: 64,
    minHeight: layout.navTabHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  menu: {
    position: "absolute",
    alignSelf: "center",
    bottom: 14 + layout.navTabHeight + 10 + 26,
    minWidth: 220,
    borderRadius: layout.navRadius,
    borderWidth: 1,
    padding: 6,
    overflow: "hidden",
  },
  action: { borderRadius: layout.navTabRadius },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    minHeight: layout.minTouch,
  },
  mainFab: {
    borderRadius: 28,
    width: 56,
    height: 56,
    marginTop: -28,
    elevation: 0,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  label: { width: "100%", flexShrink: 1, textAlign: "center" },
});
