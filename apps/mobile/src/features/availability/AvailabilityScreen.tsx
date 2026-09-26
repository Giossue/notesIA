import type { availabilityRuleSchema, preferencesSchema } from "@notesia/contracts";
import { shiftLocalDate } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Divider, IconButton, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";
import {
  createAvailabilityRule,
  listAvailabilityExceptions,
  listAvailabilityRules,
  replaceAvailabilityException,
  setAvailabilityRuleArchived,
  updateAvailabilityRule,
} from "@/core/api/availability";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
import { layout } from "@/core/theme/layout";
import { userMessage } from "@/shared/errors";
import { DateField, FormSection, TimeField } from "@/shared/fields";
import { Button } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";
import { clockToMinute, minuteToClock } from "./time";
import {
  closestDaily,
  dailyChoices,
  type HourSlot,
  toMinutes,
  twoHoursAfter,
  WeeklyHoursEditor,
  weekdays,
} from "./WeeklyHours";

type Rule = z.infer<typeof availabilityRuleSchema>;
type Preferences = z.infer<typeof preferencesSchema>;
/** Un tramo del borrador; `rule` es el horario guardado del que viene, si existe. */
type Slot = HourSlot & { rule?: Rule };
type Window = { key: string; start: string; end: string };

export function AvailabilityScreen() {
  const theme = useTheme();
  const rules = useQuery({
    queryKey: ["availability-rules"],
    queryFn: listAvailabilityRules,
    retry: false,
  });
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: getPreferences,
    retry: false,
  });
  const failed = rules.isError ? rules : preferences.isError ? preferences : null;
  // Tras guardar se recarga el formulario con lo guardado; el resultado se muestra aquí.
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ error?: unknown } | null>(null);
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Mi horario de estudio" }}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Indica cuándo puedes estudiar cada semana. El planificador solo propone sesiones en esos
        horarios.
      </Text>
      {(rules.isPending || preferences.isPending) && !failed && (
        <ActivityIndicator accessibilityLabel="Cargando horario" />
      )}
      {failed && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(failed.error)}</Text>
          <Button onPress={() => void failed.refetch()}>Reintentar</Button>
        </View>
      )}
      {rules.data && preferences.data && (
        <ScheduleForm
          key={generation}
          rules={rules.data.items.filter((rule) => !rule.archivedAt)}
          preferences={preferences.data}
          onSaving={() => setResult(null)}
          onSaved={(error) => {
            setResult({ error });
            setGeneration((value) => value + 1);
          }}
        />
      )}
      {result &&
        (result.error ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {userMessage(result.error)}
          </Text>
        ) : (
          <Text accessibilityRole="alert">Horario guardado.</Text>
        ))}
    </ScreenLayout>
  );
}

/** Todo el horario se edita como borrador y se guarda con un solo botón al final. */
function ScheduleForm({
  rules,
  preferences,
  onSaving,
  onSaved,
}: {
  rules: Rule[];
  preferences: Preferences;
  onSaving(): void;
  onSaved(error?: unknown): void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const [days, setDays] = useState<Slot[][]>(() =>
    weekdays.map((_, index) =>
      rules
        .filter((rule) => rule.weekday === index + 1)
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((rule) => ({
          key: rule.id,
          rule,
          start: minuteToClock(rule.startMinute),
          end: minuteToClock(rule.endMinute),
        })),
    ),
  );
  const [daily, setDaily] = useState<string>(closestDaily(preferences.maxDailyMinutes));
  const [exceptionDate, setExceptionDate] = useState("");
  // null: la excepción no se tocó y no se guarda.
  const [exceptionWindows, setExceptionWindows] = useState<Window[] | null>(null);
  const existing = useQuery({
    queryKey: ["availability-exception", exceptionDate],
    queryFn: () => listAvailabilityExceptions(exceptionDate, shiftLocalDate(exceptionDate, 1)),
    enabled: exceptionDate !== "",
    retry: false,
  });
  const currentException = existing.data?.items[0];
  useEffect(() => {
    if (!existing.data) return;
    setExceptionWindows(
      (existing.data.items[0]?.windows ?? []).map((window) => ({
        key: uuidv4(),
        start: minuteToClock(window.startMinute),
        end: minuteToClock(window.endMinute),
      })),
    );
  }, [existing.data]);

  const updateDay = (weekday: number, change: (slots: Slot[]) => Slot[]) =>
    setDays((current) =>
      current.map((slots, index) => (index === weekday ? change(slots) : slots)),
    );

  const save = useMutation({
    mutationFn: async () => {
      onSaving();
      const kept = new Set<string>();
      for (const [index, slots] of days.entries()) {
        for (const slot of slots) {
          const { startMinute, endMinute } = toMinutes(slot.start, slot.end);
          if (!slot.rule) {
            await createAvailabilityRule({
              id: uuidv4(),
              weekday: index + 1,
              startMinute,
              endMinute,
            });
            continue;
          }
          kept.add(slot.rule.id);
          if (slot.rule.startMinute !== startMinute || slot.rule.endMinute !== endMinute)
            await updateAvailabilityRule(slot.rule.id, {
              weekday: index + 1,
              startMinute,
              endMinute,
              version: slot.rule.version,
            });
        }
      }
      for (const rule of rules)
        if (!kept.has(rule.id)) await setAvailabilityRuleArchived(rule.id, rule.version, true);

      const minutes = Number(daily);
      if (minutes !== preferences.maxDailyMinutes) {
        const updated = await updatePreferences({
          minSessionMinutes: Math.min(preferences.minSessionMinutes, minutes),
          maxSessionMinutes: preferences.maxSessionMinutes,
          maxDailyMinutes: minutes,
          notificationsEnabled: true,
          pushNotificationsEnabled: true,
          quietStartMinute: preferences.quietStartMinute,
          quietEndMinute: preferences.quietEndMinute,
          version: preferences.version,
        });
        queryClient.setQueryData(["preferences"], updated);
      }

      if (exceptionDate && exceptionWindows) {
        const windows = exceptionWindows.map((window) => ({
          startMinute: clockToMinute(window.start),
          endMinute: clockToMinute(window.end),
        }));
        if (windows.some((window) => window.endMinute <= window.startMinute))
          throw new Error("En el día especial, cada intervalo debe terminar después de iniciar.");
        const updated = await replaceAvailabilityException(exceptionDate, {
          version: currentException?.version ?? null,
          windows,
        });
        queryClient.setQueryData(["availability-exception", updated.date], { items: [updated] });
      }
    },
    // Aunque falle a mitad, se recarga lo guardado para no duplicar horarios al reintentar.
    onSettled: async (_data, error) => {
      await queryClient.invalidateQueries({ queryKey: ["availability-rules"] });
      onSaved(error ?? undefined);
    },
  });

  return (
    <View style={styles.form}>
      <FormSection title="Días y horas">
        <WeeklyHoursEditor days={days} onChangeDay={updateDay} />
      </FormSection>

      <FormSection title="Máximo de estudio al día">
        <Tabs value={daily} onValueChange={setDaily} buttons={[...dailyChoices]} />
      </FormSection>

      <Divider />

      <FormSection
        title="Un día diferente (opcional)"
        hint="Elige una fecha para cambiar solo ese día. Sin intervalos, ese día queda libre de estudio."
      >
        <DateField
          label="Fecha"
          value={exceptionDate}
          onChange={(value) => {
            setExceptionDate(value);
            setExceptionWindows(null);
          }}
        />
        {existing.isFetching && <ActivityIndicator accessibilityLabel="Consultando el día" />}
        {existing.isError && <Text accessibilityRole="alert">{userMessage(existing.error)}</Text>}
        {exceptionDate !== "" && exceptionWindows && (
          <View style={styles.group}>
            {exceptionWindows.length === 0 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Ninguna hora: ese día no se planifica estudio.
              </Text>
            )}
            {exceptionWindows.map((window, position) => (
              <View key={window.key} style={styles.slotRow}>
                <View style={styles.flex}>
                  <TimeField
                    label="Desde"
                    value={window.start}
                    onChange={(start) =>
                      setExceptionWindows((current) =>
                        (current ?? []).map((item) =>
                          item.key === window.key ? { ...item, start } : item,
                        ),
                      )
                    }
                  />
                </View>
                <View style={styles.flex}>
                  <TimeField
                    label="Hasta"
                    value={window.end}
                    onChange={(end) =>
                      setExceptionWindows((current) =>
                        (current ?? []).map((item) =>
                          item.key === window.key ? { ...item, end } : item,
                        ),
                      )
                    }
                  />
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  accessibilityLabel={`Quitar intervalo ${position + 1}`}
                  onPress={() =>
                    setExceptionWindows((current) =>
                      (current ?? []).filter((item) => item.key !== window.key),
                    )
                  }
                  style={styles.remove}
                />
              </View>
            ))}
            <Button
              mode="outlined"
              icon="plus"
              onPress={() =>
                setExceptionWindows((current) => {
                  const start = current?.at(-1)?.end ?? "08:00";
                  return [...(current ?? []), { key: uuidv4(), start, end: twoHoursAfter(start) }];
                })
              }
            >
              Agregar intervalo
            </Button>
          </View>
        )}
      </FormSection>

      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending || existing.isFetching}
        onPress={() => save.mutate()}
      >
        Guardar
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: layout.sectionGap },
  group: { gap: layout.itemGap },
  flex: { flex: 1 },
  dayHeader: { flexDirection: "row", alignItems: "center" },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  remove: { margin: 0, marginTop: 6 },
});
