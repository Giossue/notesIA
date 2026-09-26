import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Icon,
  Portal,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { getProfile } from "@/core/api/profile";
import { signOut } from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { useAppearance } from "@/core/theme/AppearanceProvider";
import { layout } from "@/core/theme/layout";
import { categoryColors } from "@/core/theme/theme";
import type { RootStackParamList } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { Button, Dialog } from "@/shared/paper";
import { ScreenHeader } from "@/shared/ScreenHeader";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { UserAvatar } from "@/shared/UserAvatar";
import { AppearanceSelector } from "./AppearanceSelector";

const appearanceLabels = { system: "Automático", light: "Claro", dark: "Oscuro" } as const;

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const categories = categoryColors[theme.dark ? "dark" : "light"];
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const { preference } = useAppearance();
  const [themeOpen, setThemeOpen] = useState(false);
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await clearPrivateCache(queryClient);
      queryClient.setQueryData(["session"], null);
    },
  });

  const name = profile.data?.displayName ?? "";

  const menu = [
    {
      icon: "clock-outline",
      color: categories.blue,
      title: "Mi horario de estudio",
      subtitle: "Cuándo puedes estudiar cada semana",
      onPress: () => navigation.navigate("Availability"),
    },
    {
      icon: "bell",
      color: categories.pink,
      title: "Avisos",
      subtitle: "Anticipación y horario de no molestar",
      onPress: () => navigation.navigate("Alerts"),
    },
    {
      icon: "weather-night",
      color: categories.cyan,
      title: "Tema",
      subtitle: appearanceLabels[preference] ?? "Claro, oscuro o automático",
      onPress: () => setThemeOpen(true),
    },
    {
      icon: "shield-lock-outline",
      color: categories.gray,
      title: "Privacidad y datos",
      subtitle: "Documentos, IA, exportar o eliminar tu cuenta",
      onPress: () => navigation.navigate("Privacy"),
    },
    {
      icon: "lifebuoy",
      color: categories.orange,
      title: "Ayuda y reportes",
      subtitle: "Reporta un problema o envía una sugerencia",
      onPress: () => navigation.navigate("Reports"),
    },
  ];

  return (
    <ScreenLayout tab="Profile" top={<ScreenHeader compact title="Perfil" />}>
      <View style={[styles.card, styles.identity, { backgroundColor: theme.colors.surface }]}>
        {profile.isPending && <ActivityIndicator accessibilityLabel="Cargando perfil" />}
        {profile.isError && (
          <View style={styles.message}>
            <Text accessibilityRole="alert">{userMessage(profile.error)}</Text>
            <Button onPress={() => void profile.refetch()}>Reintentar</Button>
          </View>
        )}
        {profile.data && (
          <>
            <UserAvatar avatar={profile.data.avatar} size={88} />
            <View style={styles.identityCopy}>
              <Text variant="titleLarge" numberOfLines={1} style={styles.bold}>
                {name}
              </Text>
              <Text
                variant="bodyMedium"
                numberOfLines={1}
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {profile.data.email}
              </Text>
              <TouchableRipple
                borderless
                onPress={() => navigation.navigate("ProfileEdit")}
                accessibilityRole="button"
                accessibilityLabel="Editar perfil"
                style={[styles.editButton, { backgroundColor: theme.colors.primaryContainer }]}
              >
                <View style={styles.editContent}>
                  <Icon source="pencil-outline" size={18} color={theme.colors.primary} />
                  <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
                    Editar perfil
                  </Text>
                </View>
              </TouchableRipple>
            </View>
          </>
        )}
      </View>

      <View style={styles.menu}>
        {menu.map((item) => (
          <TouchableRipple
            borderless
            key={item.title}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <View style={styles.menuRow}>
              <View style={[styles.menuIcon, { backgroundColor: item.color }]}>
                <Icon source={item.icon} size={22} color="#FFFFFF" />
              </View>
              <View style={styles.menuCopy}>
                <Text variant="titleMedium" style={styles.bold}>
                  {item.title}
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.subtitle}
                </Text>
              </View>
              <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
            </View>
          </TouchableRipple>
        ))}
      </View>

      <TouchableRipple
        borderless
        disabled={logout.isPending || offline}
        onPress={() => logout.mutate()}
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.logout}>
          {logout.isPending ? (
            <ActivityIndicator size="small" color={theme.colors.error} />
          ) : (
            <Icon source="logout" size={22} color={theme.colors.error} />
          )}
          <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.error }]}>
            Cerrar sesión
          </Text>
        </View>
      </TouchableRipple>

      <Portal>
        <Dialog visible={themeOpen} onDismiss={() => setThemeOpen(false)}>
          <Dialog.Content>
            <AppearanceSelector />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setThemeOpen(false)}>Listo</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
  bold: { fontWeight: "700" },
  card: { borderRadius: layout.cardRadius },
  identity: { flexDirection: "row", alignItems: "center", gap: 18, padding: 18 },
  identityCopy: { flex: 1, gap: 4 },
  editButton: { alignSelf: "flex-start", borderRadius: layout.smallRadius, marginTop: 8 },
  editContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  menu: { gap: 10 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 16, padding: 14, minHeight: 72 },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  menuCopy: { flex: 1, gap: 1 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 60,
  },
});
