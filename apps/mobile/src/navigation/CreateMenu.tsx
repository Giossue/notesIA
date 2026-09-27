import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Icon, Portal, Surface, Text, TouchableRipple, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "@/core/theme/layout";
import { categoryColors } from "@/core/theme/theme";
import { FadeUp } from "@/shared/motion";
import type { RootStackParamList } from "./types";

export const FAB_SIZE = 64;

/** Menú de creación desde la navegación principal. */
export function CreateMenu({
  open,
  onClose,
  bottom,
  align = "center",
  date,
}: {
  open: boolean;
  onClose: () => void;
  /** Distancia desde el borde inferior de la pantalla. */
  bottom: number;
  align?: "center" | "end";
  /** Día abierto en el calendario: solo se ofrece lo que tiene fecha, ya con ese día. */
  date?: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const categories = categoryColors[theme.dark ? "dark" : "light"];
  if (!open) return null;

  const actions = [
    {
      icon: "checkbox-marked-circle-outline",
      label: "Nueva tarea",
      route: "ActivityForm",
      open: () => navigation.navigate("ActivityForm", { date }),
      color: categories.blue,
    },
    {
      icon: "robot",
      label: "Asistente",
      route: "AiAssistant",
      open: () => navigation.navigate("AiAssistant"),
      color: categories.cyan,
    },
  ];

  return (
    <Portal>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }]}
        onPress={onClose}
        accessibilityLabel="Cerrar"
      />
      <Surface
        elevation={3}
        style={[
          styles.menu,
          align === "end" ? styles.menuEnd : styles.menuCenter,
          { backgroundColor: theme.colors.surface, bottom },
        ]}
      >
        {actions.map((action, index) => (
          <FadeUp key={action.route} index={index}>
            <TouchableRipple
              accessibilityRole="button"
              accessibilityLabel={action.label}
              rippleColor={theme.colors.surfaceVariant}
              style={styles.action}
              onPress={() => {
                onClose();
                action.open();
              }}
            >
              <View style={styles.actionContent}>
                <View style={[styles.actionIcon, { backgroundColor: action.color }]}>
                  <Icon source={action.icon} size={20} color="#FFFFFF" />
                </View>
                <Text variant="bodyLarge" style={styles.actionLabel}>
                  {action.label}
                </Text>
              </View>
            </TouchableRipple>
          </FadeUp>
        ))}
      </Surface>
    </Portal>
  );
}

export type FabOptions = {
  /** Día abierto en el calendario (solo con el menú). */
  date?: string;
  /** Acción directa en lugar del menú de creación. */
  onPress?: () => void;
  label?: string;
};

/** Botón + flotante en la esquina, para pantallas sin barra de navegación. */
export function CreateFab({
  date,
  onPress,
  label = "Crear",
  hidden = false,
}: FabOptions & { hidden?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const bottom = Math.max(insets.bottom, 10) + 16;
  // Baja fuera de la pantalla al desplazar hacia abajo y vuelve al subir.
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(offset, {
      toValue: hidden && !open ? bottom + FAB_SIZE + 8 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, open, bottom, offset]);

  return (
    <>
      <Animated.View style={[styles.fabWrap, { bottom, transform: [{ translateY: offset }] }]}>
        <TouchableRipple
          borderless
          onPress={onPress ?? (() => setOpen((value) => !value))}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={onPress ? undefined : { expanded: open }}
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        >
          <SpinningPlus open={open} size={32} color={theme.colors.onPrimary} />
        </TouchableRipple>
      </Animated.View>
      <CreateMenu
        open={open}
        onClose={() => setOpen(false)}
        bottom={bottom + FAB_SIZE + 12}
        align="end"
        date={date}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  menu: {
    position: "absolute",
    minWidth: 240,
    borderRadius: layout.cardRadius,
    padding: 8,
  },
  menuCenter: { alignSelf: "center" },
  menuEnd: { right: layout.pagePadding },
  action: { borderRadius: layout.smallRadius },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontWeight: "500" },
  fabWrap: { position: "absolute", right: layout.pagePadding },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * El «+» del botón de crear: al abrir el menú gira con un resorte suave hasta
 * quedar como una «×», y al cerrar vuelve.
 */
export function SpinningPlus({
  open,
  size,
  color,
}: {
  open: boolean;
  size: number;
  color: string;
}) {
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(turn, {
      toValue: open ? 1 : 0,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [open, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "135deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon source="plus" size={size} color={color} />
    </Animated.View>
  );
}
