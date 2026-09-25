import { zodResolver } from "@hookform/resolvers/zod";
import { type Profile, type ProfileUpdate, profileUpdateSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { getProfile, updateProfile } from "@/core/api/profile";
import { signOut } from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { AppearanceSelector } from "./AppearanceSelector";

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await clearPrivateCache(queryClient);
      queryClient.setQueryData(["session"], null);
    },
  });

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button
        icon="arrow-left"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Volver a inicio"
      >
        Volver
      </Button>
      <Text variant="headlineMedium">Tu perfil</Text>
      {profile.isPending && <ActivityIndicator accessibilityLabel="Cargando perfil" />}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{profile.error.message}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar</Button>
        </View>
      )}
      {profile.data && <ProfileForm key={profile.data.version} profile={profile.data} />}
      <AppearanceSelector />
      <Button
        mode="outlined"
        icon="tools"
        onPress={() => navigation.navigate("Tools")}
        contentStyle={sharedStyles.actionContent}
      >
        Configuración y herramientas
      </Button>
      <Button
        mode="outlined"
        icon="logout"
        loading={logout.isPending}
        disabled={logout.isPending || offline}
        onPress={() => logout.mutate()}
        contentStyle={sharedStyles.actionContent}
        accessibilityLabel="Cerrar sesión"
      >
        Cerrar sesión
      </Button>
      {logout.isError && <Text accessibilityRole="alert">{logout.error.message}</Text>}
    </ScreenLayout>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileUpdate>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      displayName: profile.displayName,
      language: profile.language,
      timeZone: profile.timeZone,
      version: profile.version,
    },
  });
  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile"], updated);
      navigation.goBack();
    },
  });

  return (
    <View style={styles.fields}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {profile.email}
      </Text>
      <Controller
        control={control}
        name="displayName"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Nombre visible"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.displayName}
            accessibilityLabel="Nombre visible"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.displayName}>
        {errors.displayName?.message}
      </HelperText>
      <Text variant="titleSmall">Idioma preferido</Text>
      <Controller
        control={control}
        name="language"
        render={({ field }) => (
          <SegmentedButtons
            value={field.value}
            onValueChange={field.onChange}
            buttons={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
          />
        )}
      />
      <Controller
        control={control}
        name="timeZone"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Zona horaria"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            error={!!errors.timeZone}
            accessibilityLabel="Zona horaria IANA"
          />
        )}
      />
      <HelperText type={errors.timeZone ? "error" : "info"} visible>
        {errors.timeZone?.message ?? "Por ejemplo, America/Guayaquil."}
      </HelperText>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {mutation.isError && <Text accessibilityRole="alert">{mutation.error.message}</Text>}
      <Button
        mode="contained"
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar cambios
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
  fields: { gap: layout.fieldGap },
});
