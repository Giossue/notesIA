import { zodResolver } from "@hookform/resolvers/zod";
import { avatarIdSchema, defaultAvatarId } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
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
import { AvatarPicker } from "@/shared/AvatarPicker";
import { Button, TextInput } from "@/shared/paper";
import { AuthHero, HeroStatusBar, heroColors } from "./AuthHero";
import { WelcomeScreen } from "./WelcomeScreen";
import { readWelcomeSeen, writeWelcomeSeen } from "./welcome-storage";

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
type Mode = "signIn" | "signUp" | "recover";

const heroCopy = {
  signIn: {
    title: "Hola de\nnuevo",
    subtitle: "Inicia sesión para seguir organizando tu tiempo.",
  },
  signUp: {
    title: "Empecemos",
    subtitle: "Crea tu cuenta para organizar tus actividades.",
  },
  recover: {
    title: "Recupera tu\nacceso",
    subtitle: "Te enviaremos un enlace para crear una contraseña nueva.",
  },
} as const;

export function AuthScreen() {
  const queryClient = useQueryClient();
  const welcome = useQuery({
    queryKey: ["welcome-seen"],
    queryFn: readWelcomeSeen,
    // Es una lectura local: no debe pausarse sin conexión.
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [mode, setMode] = useState<Mode>("signIn");

  if (welcome.isPending) return <View style={styles.dark} />;
  // Si no se puede leer el llavero, se entra directo al acceso.
  if (welcome.data === false) {
    return (
      <WelcomeScreen
        onDone={(next) => {
          setMode(next);
          queryClient.setQueryData(["welcome-seen"], true);
          void writeWelcomeSeen().catch(() => undefined);
        }}
      />
    );
  }
  return <AuthFlow mode={mode} setMode={setMode} />;
}

function AuthFlow({ mode, setMode }: { mode: Mode; setMode(mode: Mode): void }) {
  const theme = useTheme();
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const offline = useNetInfo().isConnected === false;
  const go = (next: Mode) => {
    setMode(next);
    setNotice(null);
  };

  useEffect(() => {
    const handleUrl = (url: string) => {
      const result = emailVerificationCallbackResult(url);
      if (!result) return;
      if (result.kind === "verified") {
        setVerificationEmail(null);
        setMode("signIn");
        setNotice({ text: "Correo verificado. Ya puedes iniciar sesión.", tone: "success" });
      } else {
        setNotice({
          text: "El enlace no es válido o ya venció. Solicita uno nuevo.",
          tone: "error",
        });
      }
    };
    void Linking.getInitialURL()
      .then((url) => {
        if (url) handleUrl(url);
      })
      .catch(() => {});
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [setMode]);

  const onVerificationRequired = (email: string) => {
    setVerificationEmail(email);
    setNotice(null);
  };
  const hero = verificationEmail
    ? {
        title: "Verifica tu\ncorreo",
        subtitle: "Activa tu cuenta desde el enlace que te enviamos.",
        onBack: () => {
          setVerificationEmail(null);
          go("signIn");
        },
      }
    : { ...heroCopy[mode], onBack: mode === "recover" ? () => go("signIn") : undefined };

  return (
    <SafeAreaView style={styles.dark} edges={["top"]}>
      <HeroStatusBar />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        bounces={false}
      >
        <AuthHero title={hero.title} subtitle={hero.subtitle} onBack={hero.onBack} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          {offline && (
            <Banner tone="error" icon="alert">
              Sin conexión. Revisa tu red e inténtalo de nuevo.
            </Banner>
          )}
          {notice && (
            <Banner tone={notice.tone} icon={notice.tone === "success" ? "check" : "alert"}>
              {notice.text}
            </Banner>
          )}
          {verificationEmail ? (
            <EmailVerificationPanel
              email={verificationEmail}
              offline={offline}
              onContinue={() => {
                setVerificationEmail(null);
                go("signIn");
              }}
            />
          ) : mode === "recover" ? (
            <PasswordRecoveryForm offline={offline} onBack={() => go("signIn")} />
          ) : mode === "signIn" ? (
            <SignInForm
              offline={offline}
              onRecover={() => go("recover")}
              onVerificationRequired={onVerificationRequired}
            />
          ) : (
            <SignUpForm offline={offline} onVerificationRequired={onVerificationRequired} />
          )}
          {!verificationEmail && mode !== "recover" && (
            <View style={styles.switchRow}>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                {mode === "signIn" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}
              </Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => go(mode === "signIn" ? "signUp" : "signIn")}
              >
                <Text style={[styles.link, { color: theme.colors.primary }]}>
                  {mode === "signIn" ? "Crea una" : "Inicia sesión"}
                </Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </ScrollView>
    </SafeAreaView>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "success" | "error" | "info";
  icon: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const colors = {
    success: [theme.colors.primaryContainer, theme.colors.onPrimaryContainer],
    info: [theme.colors.primaryContainer, theme.colors.onPrimaryContainer],
    error: [theme.colors.errorContainer, theme.colors.onErrorContainer],
  }[tone];
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors[0] }]}>
      <Icon source={icon} size={18} color={colors[1]} />
      <Text variant="bodyMedium" style={[styles.bannerText, { color: colors[1] }]}>
        {children}
      </Text>
    </View>
  );
}

/** Campo con etiqueta arriba y error debajo, en forma de píldora. */
function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & Omit<ComponentProps<typeof TextInput>, "error">) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>
        {label}
      </Text>
      <TextInput
        mode="outlined"
        accessibilityLabel={label}
        error={!!error}
        outlineColor={theme.colors.outlineVariant}
        outlineStyle={styles.pillOutline}
        style={styles.input}
        {...input}
      />
      {error ? (
        <View style={styles.error}>
          <Icon source="alert" size={14} color={theme.colors.error} />
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PasswordField({
  visible,
  onToggle,
  ...props
}: { visible: boolean; onToggle(): void } & ComponentProps<typeof Field>) {
  return (
    <Field
      {...props}
      secureTextEntry={!visible}
      right={
        <TextInput.Icon
          icon={visible ? "eye-off" : "eye"}
          onPress={onToggle}
          accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        />
      }
    />
  );
}

function PrimaryButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      mode="contained"
      {...props}
      style={[styles.pill, props.style]}
      contentStyle={styles.pillContent}
    />
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
  const theme = useTheme();
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
    <View style={styles.form}>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label="Correo electrónico"
            placeholder="tucorreo@ejemplo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <View>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <PasswordField
              label="Contraseña"
              placeholder="Tu contraseña"
              visible={visible}
              onToggle={() => setVisible(!visible)}
              autoComplete="current-password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.password?.message}
            />
          )}
        />
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onRecover}
          style={styles.forgot}
        >
          <Text style={[styles.link, styles.underline, { color: theme.colors.onSurface }]}>
            ¿Olvidaste tu contraseña?
          </Text>
        </Pressable>
      </View>
      <PrimaryButton
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
      >
        Iniciar sesión
      </PrimaryButton>
    </View>
  );
}

function PasswordRecoveryForm({ offline, onBack }: { offline: boolean; onBack(): void }) {
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: "" },
  });
  const mutation = useMutation({
    mutationFn: ({ email }: RecoveryValues) => requestPasswordReset(email),
  });
  if (mutation.isSuccess) {
    return (
      <SentPanel
        icon="email-check-outline"
        title="Revisa tu correo"
        text={`Si ${getValues("email")} pertenece a una cuenta, te llegará un enlace para crear una contraseña nueva.`}
      >
        <PrimaryButton onPress={onBack}>Volver a iniciar sesión</PrimaryButton>
      </SentPanel>
    );
  }
  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label="Correo electrónico"
            placeholder="tucorreo@ejemplo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <PrimaryButton
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
      >
        Enviar enlace
      </PrimaryButton>
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
    <View style={styles.form}>
      <Controller
        control={control}
        name="avatar"
        render={({ field }) => <AvatarPicker value={field.value} onChange={field.onChange} />}
      />
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field
            label="Nombre"
            placeholder="¿Cómo te llamas?"
            autoComplete="name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label="Correo electrónico"
            placeholder="tucorreo@ejemplo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <PasswordField
            label="Contraseña"
            placeholder="Mínimo 12 caracteres"
            visible={visible}
            onToggle={() => setVisible(!visible)}
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
          />
        )}
      />
      <PrimaryButton
        loading={mutation.isPending}
        disabled={offline || mutation.isPending}
        onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
      >
        Crear cuenta
      </PrimaryButton>
    </View>
  );
}

function SentPanel({
  icon,
  title,
  text,
  children,
}: {
  icon: string;
  title: string;
  text: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sent}>
      <View style={[styles.sentIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <Icon source={icon} size={32} color={theme.colors.primary} />
      </View>
      <Text variant="titleLarge" style={styles.bold}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={[styles.center, { color: theme.colors.onSurfaceVariant }]}>
        {text}
      </Text>
      <View style={styles.sentActions}>{children}</View>
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
    <SentPanel
      icon="email-sync-outline"
      title="Te enviamos un enlace"
      text={
        <>
          Abre el correo que enviamos a <Text style={styles.bold}>{email}</Text> para activar tu
          cuenta antes de iniciar sesión.
        </>
      }
    >
      {resend.isSuccess && (
        <Banner tone="success" icon="check">
          Correo enviado nuevamente.
        </Banner>
      )}
      <PrimaryButton onPress={onContinue}>Ya verifiqué mi correo</PrimaryButton>
      <PrimaryButton
        mode="outlined"
        loading={resend.isPending}
        disabled={offline || resend.isPending}
        onPress={() => resend.mutate()}
      >
        Reenviar correo
      </PrimaryButton>
    </SentPanel>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: heroColors.background },
  scroll: { flexGrow: 1 },
  sheet: {
    flexGrow: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 20,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: { flex: 1 },
  form: { gap: 16 },
  field: { gap: 8 },
  input: { minHeight: 52 },
  pillOutline: { borderRadius: 999 },
  error: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  forgot: { alignSelf: "flex-end", marginTop: 12 },
  link: { fontWeight: "600" },
  underline: { textDecorationLine: "underline" },
  pill: { borderRadius: 999 },
  pillContent: { minHeight: 52 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: "auto",
  },
  sent: { alignItems: "center", gap: 12, paddingTop: 8 },
  sentIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  sentActions: { alignSelf: "stretch", gap: 12, marginTop: 12 },
  bold: { fontWeight: "700" },
  center: { textAlign: "center" },
});
