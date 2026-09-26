import type { Profile } from "@notesia/contracts";
import { shiftLocalDate } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { HelperText, Icon, IconButton, ProgressBar, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { v4 as uuidv4 } from "uuid";
import { layout } from "@/core/theme/layout";
import {
  closestDaily,
  dailyChoices,
  type HourSlot,
  WeeklyHoursEditor,
  weekdays,
} from "@/features/availability/WeeklyHours";
import { userMessage } from "@/shared/errors";
import { DateField, FormSection, TimeField } from "@/shared/fields";
import { Button, Card, TextInput } from "@/shared/paper";
import { useHideSplash } from "@/shared/splash";
import { Tabs } from "@/shared/Tabs";
import type { Commitment, CommitmentKind, WeekSetup } from "./save-week";
import { useLocalToday, useSaveWeek } from "./useSaveWeek";

type Kind = CommitmentKind;
const kindLabels: Record<Kind, string> = { class: "Clase", work: "Trabajo", other: "Otro" };
const letters = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Configuración inicial, una sola vez después de registrarse: cuándo puede
 * estudiar y qué compromisos fijos tiene (clases, trabajo). Con eso la app arma
 * sola el plan de estudio.
 */
export function OnboardingScreen({
  profile,
  initial,
  onUseAgent,
}: {
  profile: Profile;
  initial?: WeekSetup;
  /** Volver a armar la semana conversando con el agente. */
  onUseAgent?(): void;
}) {
  useHideSplash();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const { timeZone, today } = useLocalToday(profile.timeZone);
  // Con lo que armó el agente se empieza directo en el horario de estudio.
  const [step, setStep] = useState(initial ? 1 : 0);
  const [days, setDays] = useState<HourSlot[][]>(() => initial?.days ?? weekdays.map(() => []));
  const [daily, setDaily] = useState<string>(initial?.daily ?? closestDaily(180));
  const [commitments, setCommitments] = useState<Commitment[]>(initial?.commitments ?? []);
  const hasHours = days.some((slots) => slots.length > 0);

  const updateDay = (weekday: number, change: (slots: HourSlot[]) => HourSlot[]) =>
    setDays((current) =>
      current.map((slots, index) => (index === weekday ? change(slots) : slots)),
    );
  const { finish, progress } = useSaveWeek(timeZone, today);
  const saved = progress.saved;
  const total = progress.total;

  const steps = [
    <Intro key="intro" name={profile.displayName} />,
    <View key="hours" style={styles.section}>
      <StepTitle
        icon="book-clock-outline"
        title="¿Cuándo puedes estudiar?"
        text="Marca las horas libres de cada día que quieres dedicar a estudiar. La app solo pondrá sesiones de estudio en esos horarios."
      />
      <WeeklyHoursEditor days={days} onChangeDay={updateDay} emptyText="Sin estudio este día." />
      <FormSection title="Máximo de estudio al día">
        <Tabs value={daily} onValueChange={setDaily} buttons={[...dailyChoices]} />
      </FormSection>
    </View>,
    <View key="commitments" style={styles.section}>
      <StepTitle
        icon="calendar-lock-outline"
        title="Tus compromisos fijos"
        text="Clases, trabajo u otras cosas que se repiten cada semana. En esas horas estás ocupado y la app no te pondrá a estudiar."
      />
      {commitments.map((item) => (
        <Card key={item.key} mode="contained">
          <Card.Content style={styles.commitment}>
            <View style={styles.flex}>
              <Text variant="titleMedium">{item.title}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {kindLabels[item.kind]} · {item.days.map((day) => letters[day - 1]).join(" ")} ·{" "}
                {item.start}–{item.end} · hasta {item.until}
              </Text>
            </View>
            <IconButton
              icon="close"
              accessibilityLabel={`Quitar ${item.title}`}
              onPress={() =>
                setCommitments((current) => current.filter((row) => row.key !== item.key))
              }
            />
          </Card.Content>
        </Card>
      ))}
      <CommitmentForm
        defaultUntil={shiftLocalDate(today, 16 * 7)}
        today={today}
        onAdd={(item) => setCommitments((current) => [...current, item])}
      />
    </View>,
    <View key="done" style={styles.section}>
      <StepTitle
        icon="rocket-launch-outline"
        title="¡Todo listo!"
        text="Cuando agregues tareas con su fecha de entrega y tiempo estimado, la app repartirá solas las sesiones de estudio en tu Agenda. Si cambias algo, el plan se acomoda solo."
      />
      {finish.isPending && total > 0 && (
        <View style={styles.progress}>
          <ProgressBar progress={saved / total} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Guardando tu semana… {saved}/{total}
          </Text>
        </View>
      )}
      {finish.isError && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {userMessage(finish.error)}
        </Text>
      )}
    </View>,
  ];
  const last = step === steps.length - 1;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.dots}>
        {steps.map((item, index) => (
          <View
            key={item.key}
            style={[
              styles.dot,
              {
                backgroundColor: index <= step ? theme.colors.primary : theme.colors.surfaceVariant,
              },
            ]}
          />
        ))}
      </View>
      <ScrollView
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {steps[step]}
      </ScrollView>
      <View style={styles.footer}>
        {offline && (
          <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para continuar.</Text>
        )}
        {step === 1 && !hasHours && (
          <HelperText type="info">Agrega al menos un horario para continuar.</HelperText>
        )}
        <View style={styles.actions}>
          {step > 0 && !(initial && step === 1) && (
            <Button disabled={finish.isPending} onPress={() => setStep(step - 1)}>
              Atrás
            </Button>
          )}
          {onUseAgent && step <= 1 && (
            <Button icon="robot" disabled={finish.isPending} onPress={onUseAgent}>
              Con el asistente
            </Button>
          )}
          <View style={styles.flex} />
          {step === 2 && commitments.length === 0 && (
            <Button onPress={() => setStep(3)}>Omitir</Button>
          )}
          <Button
            mode="contained"
            loading={finish.isPending}
            disabled={(step === 1 && !hasHours) || finish.isPending || (last && offline)}
            onPress={() => (last ? finish.mutate({ days, daily, commitments }) : setStep(step + 1))}
          >
            {step === 0
              ? "Empezar"
              : last
                ? finish.isError
                  ? "Reintentar"
                  : "Empezar a usar"
                : "Siguiente"}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Intro({ name }: { name: string }) {
  const theme = useTheme();
  const points = [
    { icon: "book-clock-outline", text: "Cuándo puedes estudiar cada semana." },
    { icon: "calendar-lock-outline", text: "Tus clases y compromisos fijos." },
    { icon: "calendar-check-outline", text: "Con eso, la app arma sola tu plan de estudio." },
  ];
  return (
    <View style={styles.section}>
      <StepTitle
        icon="hand-wave-outline"
        title={`¡Hola, ${name.split(" ")[0]}!`}
        text="Antes de empezar, armemos tu semana. Solo toma un par de minutos."
      />
      {points.map((point) => (
        <View key={point.text} style={styles.point}>
          <View style={[styles.pointIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source={point.icon} size={22} color={theme.colors.primary} />
          </View>
          <Text variant="bodyLarge" style={styles.flex}>
            {point.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StepTitle({ icon, title, text }: { icon: string; title: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.title}>
      <Icon source={icon} size={40} color={theme.colors.primary} />
      <Text variant="headlineSmall" style={styles.bold}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {text}
      </Text>
    </View>
  );
}

function CommitmentForm({
  defaultUntil,
  today,
  onAdd,
}: {
  defaultUntil: string;
  today: string;
  onAdd(item: Commitment): void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("class");
  const [selected, setSelected] = useState<number[]>([]);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [until, setUntil] = useState(defaultUntil);
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    if (!title.trim()) return setError("Escribe un nombre, por ejemplo Cálculo.");
    if (selected.length === 0) return setError("Elige al menos un día.");
    if (start === end) return setError("La hora de inicio y fin deben ser distintas.");
    if (!until || until < today) return setError("Elige hasta qué fecha se repite.");
    onAdd({
      key: uuidv4(),
      title: title.trim(),
      kind,
      days: [...selected].sort(),
      start,
      end,
      until,
    });
    setTitle("");
    setSelected([]);
    setError(null);
  };
  return (
    <Card mode="outlined">
      <Card.Content style={styles.form}>
        <Text variant="titleMedium" style={styles.bold}>
          Agregar compromiso
        </Text>
        <TextInput
          label="Nombre"
          mode="outlined"
          value={title}
          onChangeText={setTitle}
          accessibilityLabel="Nombre del compromiso"
        />
        <Tabs
          value={kind}
          onValueChange={setKind}
          buttons={(Object.keys(kindLabels) as Kind[]).map((value) => ({
            value,
            label: kindLabels[value],
          }))}
        />
        <View style={styles.weekdays}>
          {letters.map((letter, index) => {
            const weekday = index + 1;
            const on = selected.includes(weekday);
            return (
              <Pressable
                // biome-ignore lint/suspicious/noArrayIndexKey: el día es la posición
                key={index}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={weekdays[index]}
                onPress={() =>
                  setSelected((current) =>
                    on ? current.filter((day) => day !== weekday) : [...current, weekday],
                  )
                }
                style={[
                  styles.weekday,
                  {
                    backgroundColor: on ? theme.colors.primary : theme.colors.surfaceVariant,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.bold,
                    { color: on ? theme.colors.onPrimary : theme.colors.onSurfaceVariant },
                  ]}
                >
                  {letter}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <TimeField label="Desde" value={start} onChange={setStart} />
          </View>
          <View style={styles.flex}>
            <TimeField label="Hasta" value={end} onChange={setEnd} />
          </View>
        </View>
        <DateField label="Se repite hasta (fin del ciclo)" value={until} onChange={setUntil} />
        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained-tonal" icon="plus" onPress={add}>
          Agregar
        </Button>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: layout.pagePadding, gap: layout.sectionGap, paddingBottom: 32 },
  section: { gap: layout.sectionGap },
  title: { gap: 8, marginTop: 8 },
  bold: { fontWeight: "700" },
  flex: { flex: 1 },
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingTop: 12 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  point: { flexDirection: "row", alignItems: "center", gap: 14 },
  pointIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  commitment: { flexDirection: "row", alignItems: "center" },
  form: { gap: layout.fieldGap },
  weekdays: { flexDirection: "row", justifyContent: "space-between" },
  weekday: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", gap: 10 },
  progress: { gap: 6 },
  footer: { paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
