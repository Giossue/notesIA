import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Icon, Surface, Text, TouchableRipple, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "@/core/theme/layout";
import { CreateMenu, FAB_SIZE, SpinningPlus } from "./CreateMenu";
import type { RootStackParamList } from "./types";

export type MainTab = "Home" | "Agenda" | "Progress" | "Profile";

const tabs: { route: MainTab; label: string; icon: string }[] = [
  { route: "Home", label: "Inicio", icon: "home-outline" },
  {
    route: "Agenda",
    label: "Agenda",
    icon: "calendar-blank-outline",
  },
  {
    route: "Progress",
    label: "Progreso",
    icon: "chart-bar",
  },
  { route: "Profile", label: "Perfil", icon: "account-outline" },
];

const BAR_TOP_PADDING = 10;

export function FloatingNavBar({ active }: { active: MainTab }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  // La barra respeta la zona segura inferior; el botón central se centra en su borde superior.
  const bottomInset = Math.max(insets.bottom, 10);

  const renderTab = (tab: (typeof tabs)[number]) => {
    const selected = active === tab.route;
    const color = selected ? theme.colors.primary : theme.colors.onSurfaceVariant;
    return (
      <TouchableRipple
        key={tab.route}
        onPress={() => {
          if (!selected) {
            const order = tabs.map((item) => item.route);
            const direction = order.indexOf(tab.route) > order.indexOf(active) ? "right" : "left";
            navigation.reset({
              index: tab.route === "Home" ? 0 : 1,
              routes:
                tab.route === "Home"
                  ? [{ name: "Home", params: { direction } }]
                  : [{ name: "Home" }, { name: tab.route, params: { direction } }],
            });
          }
        }}
        style={styles.tab}
        rippleColor="transparent"
        underlayColor="transparent"
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={`Ir a ${tab.label}`}
      >
        <View style={styles.tabContent}>
          <TabIcon icon={tab.icon} color={color} selected={selected} />
          <Text
            variant="labelMedium"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[styles.label, { color }, selected && styles.selectedLabel]}
          >
            {tab.label}
          </Text>
        </View>
      </TouchableRipple>
    );
  };

  return (
    <>
      <Surface
        elevation={2}
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            paddingBottom: bottomInset,
            shadowColor: theme.colors.shadow,
          },
        ]}
        accessibilityLabel="Navegación principal"
      >
        <View style={styles.row}>
          {tabs.slice(0, 2).map(renderTab)}
          <View style={styles.fabSpace} />
          {tabs.slice(2).map(renderTab)}
        </View>
      </Surface>
      <TouchableRipple
        borderless
        onPress={() => setCreateOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel="Crear"
        accessibilityState={{ expanded: createOpen }}
        style={[
          styles.fab,
          {
            bottom: bottomInset + BAR_TOP_PADDING + layout.navTabHeight - FAB_SIZE / 2,
            backgroundColor: theme.colors.primary,
          },
        ]}
      >
        <SpinningPlus open={createOpen} size={34} color={theme.colors.onPrimary} />
      </TouchableRipple>
      <CreateMenu
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        bottom={bottomInset + BAR_TOP_PADDING + layout.navTabHeight + FAB_SIZE / 2 + 16}
      />
    </>
  );
}

/**
 * Cada pantalla trae su barra: al llegar a una pestaña, su ícono da un salto
 * corto (se encoge un poco y rebota a su tamaño).
 */
function TabIcon({ icon, color, selected }: { icon: string; color: string; selected: boolean }) {
  const scale = useRef(new Animated.Value(selected ? 0.75 : 1)).current;
  useEffect(() => {
    if (!selected) return;
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [selected, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon source={icon} color={color} size={26} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: layout.navRadius,
    borderTopRightRadius: layout.navRadius,
    paddingTop: BAR_TOP_PADDING,
    paddingHorizontal: 4,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  row: { flexDirection: "row", alignItems: "center" },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.navTabHeight,
    justifyContent: "center",
  },
  tabContent: { alignItems: "center", justifyContent: "center", gap: 4 },
  label: { textAlign: "center" },
  selectedLabel: { fontWeight: "600" },
  fabSpace: { width: FAB_SIZE + 4 },
  fab: {
    position: "absolute",
    alignSelf: "center",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
