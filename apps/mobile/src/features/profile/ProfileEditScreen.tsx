import { zodResolver } from "@hookform/resolvers/zod";
import { type Profile, type ProfileUpdate, profileUpdateSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Text, useTheme } from "react-native-paper";
import { getProfile, updateProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { AvatarPicker } from "@/shared/AvatarPicker";
import { userMessage } from "@/shared/errors";
import { Button, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";

export function ProfileEditScreen() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Editar perfil" }}>
      {profile.isPending && <ActivityIndicator accessibilityLabel="Cargando perfil" />}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(profile.error)}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar</Button>
        </View>
      )}
      {profile.data && <ProfileForm key={profile.data.version} profile={profile.data} />}
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
      avatar: profile.avatar,
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
        name="avatar"
        render={({ field }) => (
          <AvatarPicker value={field.value ?? profile.avatar} onChange={field.onChange} />
        )}
      />
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
          <Tabs
            value={field.value}
            onValueChange={field.onChange}
            buttons={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
          />
        )}
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
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
