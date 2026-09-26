import type { Profile } from "@notesia/contracts";
import { localDateTimeToUtc, shiftLocalDate, todayInTimeZone } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { HelperText, Icon, IconButton, ProgressBar, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { v4 as uuidv4 } from "uuid";
import { createAvailabilityRule } from "@/core/api/availability";
import { createCalendarEvent } from "@/core/api/calendar-events";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
import { completeOnboarding, getProfile } from "@/core/api/profile";
import { layout } from "@/core/theme/layout";
import { clockToMinute } from "@/features/availability/time";
import {
  closestDaily,
  dailyChoices,
  type HourSlot,
  toMinutes,
  WeeklyHoursEditor,
  weekdays,
} from "@/features/availability/WeeklyHours";
import { userMessage } from "@/shared/errors";
import { DateField, FormSection, TimeField } from "@/shared/fields";
import { Button, Card, TextInput } from "@/shared/paper";
import { useHideSplash } from "@/shared/splash";
import { Tabs } from "@/shared/Tabs";
import { deviceTimeZone, saveTimeZone, UNSET_TIME_ZONE } from "@/shared/time-zones";

type Kind = "class" | "work" | "other";
const kindLabels: Record<Kind, string> = { class: "Clase", work: "Trabajo", other: "Otro" };
const letters = ["L", "M", "M", "J", "V", "S", "D"];
/** Un compromiso fijo: se repite cada semana en los días elegidos hasta `until`. */
type Commitment = {
  key: string;
  title: string;
  kind: Kind;
  days: number[];
  start: string;
  end: string;
  until: string;
};
/** Tope de semanas que se crean por compromiso: un año. */
const MAX_WEEKS = 52;

/** Primera fecha desde `from` que cae en el día de la semana (1 = lunes). */
function firstOnWeekday(from: string, weekday: number) {
  const [year, month, day] = from.split("-").map(Number);
  const current =
    ((new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay() + 6) % 7) + 1;
  return shiftLocalDate(from, (weekday - current + 7) % 7);
}

/**
 * Configuración inicial, una sola vez después de registrarse: cuándo puede
 * estudiar y qué compromisos fijos tiene (clases, trabajo). Con eso la app arma
 * sola el plan de estudio.
 */
export function OnboardingScreen({ profile }: { profile: Profile }) {
  useHideSplash();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  // La zona del teléfono: el plan y los compromisos se calculan en ella.
  const device = deviceTimeZone();
  const timeZone = device !== UNSET_TIME_ZONE ? device : profile.timeZone;
  const today = todayInTimeZone(new Date().toISOString(), timeZone);
  const [step, setStep] = useState(0);
  const [days, setDays] = useState<HourSlot[][]>(() => weekdays.map(() => []));
  const [daily, setDaily] = useState<string>(closestDaily(180));
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [saved, setSaved] = useState(0);
  const [total, setTotal] = useState(0);
  // Mismos ids al reintentar: lo ya creado no se duplica.
  const eventIds = useRef(new Map<string, string>());
  const hasHours = days.some((slots) => slots.length > 0);

  const updateDay = (weekday: number, change: (slots: HourSlot[]) => HourSlot[]) =>
    setDays((current) =>
      current.map((slots, index) => (index === weekday ? change(slots) : slots)),
    );
  const fillWeekdayAfternoons = () =>
    setDays(
      weekdays.map((_, index) =>
        index < 5 ? [{ key: uuidv4(), start: "15:00", end: "19:00" }] : [],
      ),
    );

  const finish = useMutation({
    mutationFn: async () => {
      // Perfil fresco: al reintentar la zona ya puede estar guardada.
      const current = await getProfile();
      if (current.timeZone !== timeZone) await saveTimeZone(current, timeZone);
      const occurrences = commitments.flatMap((item) =>
        item.days.flatMap((weekday) => {
          const dates: string[] = [];
          for (
            let date = firstOnWeekday(today, weekday);
            date <= item.until && dates.length < MAX_WEEKS;
            date = shiftLocalDate(date, 7)
          )
            dates.push(date);
          return dates.map((date) => ({ item, date }));
        }),
      );
      const rules = days.flatMap((slots, index) =>
        slots.map((slot) => ({ slot, weekday: index + 1 })),
      );
      setSaved(0);
      setTotal(rules.length + occurrences.length + 2);
      const step = () => setSaved((value) => value + 1);

      for (const { slot, weekday } of rules) {
        await createAvailabilityRule({ id: slot.key, weekday, ...toMinutes(slot.start, slot.end) });
        step();
      }
      const preferences = await getPreferences();
      const minutes = Number(daily);
      await updatePreferences({
        minSessionMinutes: Math.min(preferences.minSessionMinutes, minutes),
        maxSessionMinutes: preferences.maxSessionMinutes,
        maxDailyMinutes: minutes,
        notificationsEnabled: true,
        pushNotificationsEnabled: true,
        quietStartMinute: preferences.quietStartMinute,
        quietEndMinute: preferences.quietEndMinute,
        version: preferences.version,
      });
      step();
      // De a varios a la vez: un ciclo completo puede ser un centenar de compromisos.
      for (let index = 0; index < occurrences.length; index += 8) {
        await Promise.all(
          occurrences.slice(index, index + 8).map(async ({ item, date }) => {
            const key = `${item.key}-${date}`;
            const id = eventIds.current.get(key) ?? uuidv4();
            eventIds.current.set(key, id);
            const overnight = clockToMinute(item.end) <= clockToMinute(item.start);
            await createCalendarEvent({
              id,
              kind: item.kind,
              title: item.title,
              description: null,
              startsAt: localDateTimeToUtc(`${date}T${item.start}`, timeZone),
              endsAt: localDateTimeToUtc(
                `${overnight ? shiftLocalDate(date, 1) : date}T${item.end}`,
                timeZone,
              ),
              timeZone,
            });
            step();
          }),
        );
      }
      const updated = await completeOnboarding();
      step();
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile"], updated);
      void queryClient.invalidateQueries();
    },
  });

  const steps = [
    <Intro key="intro" name={profile.displayName} />,
    <View key="hours" style={styles.section}>
      <StepTitle
        icon="book-clock-outline"
        title="¿Cuándo puedes estudiar?"
        text="Marca las horas libres de cada día que quieres dedicar a estudiar. La app solo pondrá sesiones de estudio en esos horarios."
      />
      <Button mode="outlined" icon="auto-fix" onPress={fillWeekdayAfternoons}>
        Tardes de lunes a viernes (15:00–19:00)
      </Button>
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
          {step > 0 && (
            <Button disabled={finish.isPending} onPress={() => setStep(step - 1)}>
              Atrás
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
            onPress={() => (last ? finish.mutate() : setStep(step + 1))}
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
