import { zodResolver } from "@hookform/resolvers/zod";
import { avatarIdSchema, defaultAvatarId } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { HelperText, Surface, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import {
  emailVerificationCallbackResult,
  isEmailVerificationRequired,
  requestPasswordReset,
  resendVerificationEmail,
  signIn,
  signUp,
} from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { layout, sharedStyles } from "@/core/theme/layout";
import { AvatarPicker } from "@/shared/AvatarPicker";
import { Button, TextInput } from "@/shared/paper";

const signInSchema = z.object({
  email: z.email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(1, "Escribe tu nombre."),
  avatar: avatarIdSchema,
  password: z.string().min(12, "Usa al menos 12 caracteres."),
});
const recoverySchema = z.object({
  email: z.email("Escribe un correo válido."),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;
type RecoveryValues = z.infer<typeof recoverySchema>;

export function AuthScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<"signIn" | "signUp" | "recover">("signIn");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const offline = useNetInfo().isConnected === false;

  useEffect(() => {
    const handleUrl = (url: string) => {
      const result = emailVerificationCallbackResult(url);
      if (!result) return;
      if (result.kind === "verified") {
        setVerificationEmail(null);
        setMode("signIn");
        setNotice("Correo verificado. Ya puedes iniciar sesión.");
      } else {
        setNotice("El enlace no es válido o ya venció. Solicita uno nuevo.");
      }
    };
    void Linking.getInitialURL()
      .then((url) => {
        if (url) handleUrl(url);
      })
      .catch(() => {});
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text variant="headlineMedium">Planificador estudiantil</Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Organiza tus actividades y decide cómo usar tu tiempo.
          </Text>
        </View>
        <Surface style={styles.form} elevation={1}>
          <Text variant="titleLarge">
            {verificationEmail
              ? "Verifica tu correo"
              : mode === "recover"
                ? "Recuperar acceso"
                : mode === "signIn"
                  ? "Iniciar sesión"
                  : "Crear cuenta"}
          </Text>
          {notice && <Text accessibilityRole="alert">{notice}</Text>}
          {offline && (
            <Text style={{ color: theme.colors.error }}>
              Sin conexión. Revisa tu red e inténtalo de nuevo.
            </Text>
          )}
          {verificationEmail ? (
            <EmailVerificationPanel
              email={verificationEmail}
              offline={offline}
              onContinue={() => {
                setVerificationEmail(null);
                setMode("signIn");
                setNotice(null);
              }}
            />
          ) : mode === "recover" ? (
            <PasswordRecoveryForm
              offline={offline}
              onBack={() => {
                setMode("signIn");
                setNotice(null);
              }}
            />
          ) : mode === "signIn" ? (
            <SignInForm
              offline={offline}
              onRecover={() => {
                setMode("recover");
                setNotice(null);
              }}
              onVerificationRequired={(email) => {
                setVerificationEmail(email);
                setNotice(null);
              }}
            />
          ) : (
            <SignUpForm
              offline={offline}
              onVerificationRequired={(email) => {
                setVerificationEmail(email);
                setNotice(null);
              }}
            />
          )}
          {!verificationEmail && mode !== "recover" && (
            <Button
              mode="text"
              onPress={() => {
                setMode(mode === "signIn" ? "signUp" : "signIn");
                setNotice(null);
              }}
            >
              {mode === "signIn" ? "Crear una cuenta" : "Ya tengo cuenta"}
            </Button>
          )}
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

function SignInForm({
  offline,
  onVerificationRequired,
  onRecover,
}: {
  offline: boolean;
  onVerificationRequired(email: string): void;
  onRecover(): void;
}) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: SignInValues) =>
      signIn(values.email.trim().toLowerCase(), values.password),
    onSuccess: async () => {
      await clearPrivateCache(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (error, values) => {
      if (isEmailVerificationRequired(error)) onVerificationRequired(values.email);
    },
  });

  return (
    <View style={styles.fields}>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextInput
            label="Correo electrónico"
            mode="outlined"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.email}
            accessibilityLabel="Correo electrónico"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.email}>
        {errors.email?.message}
      </HelperText>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextInput
            label="Contraseña"
            mode="outlined"
            secureTextEntry={!visible}
            autoComplete="current-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.password}
            accessibilityLabel="Contraseña"
            right={
              <TextInput.Icon
                icon={visible ? "eye-off" : "eye"}
                onPress={() => setVisible(!visible)}
                accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              />
            }
          />
        )}
      />
      <HelperText type="error" visible={!!errors.password}>
        {errors.password?.message}
      </HelperText>
      <Button
        mode="contained"
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Iniciar sesión
      </Button>
      <Button mode="text" onPress={onRecover}>
        Olvidé mi contraseña
      </Button>
    </View>
  );
}

function PasswordRecoveryForm({ offline, onBack }: { offline: boolean; onBack(): void }) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: "" },
  });
  const mutation = useMutation({
    mutationFn: ({ email }: RecoveryValues) => requestPasswordReset(email),
  });
  return (
    <View style={styles.fields}>
      <Text>
        Te enviaremos un enlace si el correo pertenece a una cuenta. El mensaje no revela si la
        cuenta existe.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Correo electrónico"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.email}
          />
        )}
      />
      <HelperText type="error" visible={!!errors.email}>
        {errors.email?.message}
      </HelperText>
      {mutation.isSuccess && (
        <Text accessibilityRole="alert">Revisa tu correo para continuar.</Text>
      )}
      <Button
        mode="contained"
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
      >
        Enviar enlace
      </Button>
      <Button mode="text" onPress={onBack}>
        Volver a iniciar sesión
      </Button>
    </View>
  );
}

function SignUpForm({
  offline,
  onVerificationRequired,
}: {
  offline: boolean;
  onVerificationRequired(email: string): void;
}) {
  const [visible, setVisible] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", avatar: defaultAvatarId },
  });
  const mutation = useMutation({
    mutationFn: (values: SignUpValues) =>
      signUp(values.name.trim(), values.email.trim().toLowerCase(), values.password, values.avatar),
    onSuccess: ({ email }) => onVerificationRequired(email),
  });

  return (
    <View style={styles.fields}>
      <Controller
        control={control}
        name="avatar"
        render={({ field }) => <AvatarPicker value={field.value} onChange={field.onChange} />}
      />
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextInput
            label="Nombre"
            mode="outlined"
            autoComplete="name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.name}
            accessibilityLabel="Nombre"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.name}>
        {errors.name?.message}
      </HelperText>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextInput
            label="Correo electrónico"
            mode="outlined"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.email}
            accessibilityLabel="Correo electrónico"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.email}>
        {errors.email?.message}
      </HelperText>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextInput
            label="Contraseña (mínimo 12 caracteres)"
            mode="outlined"
            secureTextEntry={!visible}
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.password}
            accessibilityLabel="Contraseña nueva"
            right={
              <TextInput.Icon
                icon={visible ? "eye-off" : "eye"}
                onPress={() => setVisible(!visible)}
                accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              />
            }
          />
        )}
      />
      <HelperText type="error" visible={!!errors.password}>
        {errors.password?.message}
      </HelperText>
      <Button
        mode="contained"
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Crear cuenta
      </Button>
    </View>
  );
}

function EmailVerificationPanel({
  email,
  offline,
  onContinue,
}: {
  email: string;
  offline: boolean;
  onContinue(): void;
}) {
  const resend = useMutation({
    mutationFn: () => resendVerificationEmail(email),
  });
  return (
    <View style={styles.fields}>
      <Text>
        Enviamos un enlace a {email}. Ábrelo para activar la cuenta antes de iniciar sesión.
      </Text>
      {resend.isSuccess && <Text accessibilityRole="alert">Correo enviado nuevamente.</Text>}
      <Button
        mode="contained"
        loading={resend.isPending}
        disabled={offline || resend.isPending}
        onPress={() => resend.mutate()}
        contentStyle={sharedStyles.actionContent}
      >
        Reenviar correo
      </Button>
      <Button mode="text" onPress={onContinue}>
        Ya verifiqué mi correo
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 32,
    padding: layout.pagePadding,
  },
  heading: { gap: layout.itemGap },
  form: {
    borderRadius: layout.cardRadius,
    padding: layout.pagePadding,
    gap: layout.sectionGap,
  },
  fields: { gap: 4 },
});
