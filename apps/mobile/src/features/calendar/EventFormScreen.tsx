import { zodResolver } from "@hookform/resolvers/zod";
import { type CalendarEvent, calendarEventCreateSchema, type Profile } from "@notesia/contracts";
import { localDateTimeToUtc, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  createCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/core/api/calendar-events";
import { getProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { DateTimeField, FormSection, SelectField } from "@/shared/fields";
import { Button, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { EventActions } from "./EventActions";

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Usa AAAA-MM-DD HH:mm.");
const formSchema = z.object({
  title: z.string().trim().min(1, "Escribe un título.").max(200),
  description: z.string().trim().max(10000),
  kind: z.enum(["class", "work", "appointment", "personal", "unavailable", "other"]),
  startsLocal: localDateTimeSchema,
  endsLocal: localDateTimeSchema,
  timeZone: z.string().trim().min(1, "Indica la zona horaria."),
});
type FormValues = z.infer<typeof formSchema>;

const kindLabels: Record<FormValues["kind"], string> = {
  class: "Clase",
  work: "Trabajo",
  appointment: "Cita",
  personal: "Personal",
  unavailable: "No disponible",
  other: "Otro",
};

function toUtc(value: string, timeZone: string) {
  try {
    return localDateTimeToUtc(value.replace(" ", "T"), timeZone);
  } catch {
    throw new Error(`La fecha ${value} no existe o es ambigua en ${timeZone}.`);
  }
}

export function EventFormScreen({ id, date }: { id?: string; date?: string }) {
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const event = useQuery({
    queryKey: ["calendar-event", id],
    queryFn: () => getCalendarEvent(id ?? ""),
    enabled: !!id,
    retry: false,
  });

  return (
    <ScreenLayout
      keyboardShouldPersistTaps="handled"
      header={{ title: id ? "Evento fijo" : "Nuevo evento fijo" }}
    >
      {(profile.isPending || (id && event.isPending)) && (
        <ActivityIndicator accessibilityLabel="Cargando evento" />
      )}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(profile.error)}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar perfil</Button>
        </View>
      )}
      {id && event.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(event.error)}</Text>
          <Button onPress={() => void event.refetch()}>Reintentar evento</Button>
        </View>
      )}
      {profile.data && (!id || event.data) && (
        <EventForm
          key={`${event.data?.id ?? "new"}-${event.data?.version ?? 0}-${date}`}
          event={event.data}
          date={date}
          profile={profile.data}
        />
      )}
    </ScreenLayout>
  );
}

/** "AAAA-MM-DD HH:mm" una hora después (sin pasar de las 23:59 del mismo día). */
function plusOneHour(value: string) {
  const hour = Math.min(23, Number(value.slice(11, 13)) + 1);
  const minutes = hour === 23 && Number(value.slice(11, 13)) === 23 ? "59" : value.slice(14, 16);
  return `${value.slice(0, 10)} ${String(hour).padStart(2, "0")}:${minutes}`;
}

function EventForm({
  event,
  profile,
  date,
}: {
  event?: CalendarEvent;
  profile: Profile;
  date?: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const requestIdentity = useRef({ fingerprint: "", id: uuidv4() });
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: event?.title ?? "",
      description: event?.description ?? "",
      kind: event?.kind ?? "class",
      startsLocal: event
        ? utcToLocalDateTime(event.startsAt, event.timeZone).replace("T", " ")
        : date
          ? `${date} 09:00`
          : "",
      endsLocal: event
        ? utcToLocalDateTime(event.endsAt, event.timeZone).replace("T", " ")
        : date
          ? `${date} 10:00`
          : "",
      timeZone: event?.timeZone ?? profile.timeZone,
    },
  });
  const kind = watch("kind");
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        kind: values.kind,
        title: values.title.trim(),
        description: values.description.trim() || null,
        startsAt: toUtc(values.startsLocal, values.timeZone),
        endsAt: toUtc(values.endsLocal, values.timeZone),
        timeZone: values.timeZone.trim(),
      };
      if (Date.parse(fields.endsAt) <= Date.parse(fields.startsAt)) {
        throw new Error("El fin debe ser posterior al inicio.");
      }
      const fingerprint = JSON.stringify(fields);
      if (requestIdentity.current.fingerprint !== fingerprint) {
        requestIdentity.current = { fingerprint, id: uuidv4() };
      }
      if (event) {
        return updateCalendarEvent(event.id, {
          ...fields,
          version: event.version,
          mutationId: requestIdentity.current.id,
        });
      }
      return createCalendarEvent(
        calendarEventCreateSchema.parse({
          ...fields,
          id: requestIdentity.current.id,
        }),
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["calendar-event", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      navigation.goBack();
    },
  });

  return (
    <View style={styles.form}>
      {event?.archivedAt && <Text>Evento archivado. Restáuralo para editarlo.</Text>}
      <FormSection title="Detalles">
        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <TextInput
              label="Título"
              mode="outlined"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.title}
              accessibilityLabel="Título del evento"
            />
          )}
        />
        {errors.title && <HelperText type="error">{errors.title.message}</HelperText>}
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextInput
              label="Descripción (opcional)"
              mode="outlined"
              multiline
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.description}
              accessibilityLabel="Descripción del evento"
            />
          )}
        />
        {errors.description && <HelperText type="error">{errors.description.message}</HelperText>}
      </FormSection>

      <FormSection title="Clasificación">
        <SelectField
          label="Tipo"
          value={kind}
          options={(Object.entries(kindLabels) as [FormValues["kind"], string][]).map(
            ([value, label]) => ({ value, label }),
          )}
          onChange={(value) => setValue("kind", value)}
        />
      </FormSection>

      <FormSection title="Horario" hint={`Horas de ${watch("timeZone")}.`}>
        <Controller
          control={control}
          name="startsLocal"
          render={({ field }) => (
            <DateTimeField
              label="Inicio"
              defaultTime="09:00"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                // Si aún no hay fin, se propone una hora después del inicio.
                if (!getValues("endsLocal") && value) setValue("endsLocal", plusOneHour(value));
              }}
              error={!!errors.startsLocal}
            />
          )}
        />
        {errors.startsLocal && <HelperText type="error">{errors.startsLocal.message}</HelperText>}
        <Controller
          control={control}
          name="endsLocal"
          render={({ field }) => (
            <DateTimeField
              label="Fin"
              defaultTime="10:00"
              value={field.value}
              onChange={field.onChange}
              error={!!errors.endsLocal}
            />
          )}
        />
        {errors.endsLocal && <HelperText type="error">{errors.endsLocal.message}</HelperText>}
      </FormSection>

      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending || !!event?.archivedAt}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar evento
      </Button>
      {event && <EventActions event={event} offline={offline} />}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: layout.sectionGap },
  message: { gap: layout.itemGap },
});
