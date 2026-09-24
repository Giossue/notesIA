import { zodResolver } from "@hookform/resolvers/zod";
import { type CalendarEvent, calendarEventCreateSchema, type Profile } from "@notesia/contracts";
import { localDateTimeToUtc, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  Menu,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  createCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/core/api/calendar-events";
import { getProfile } from "@/core/api/profile";
import { listSubjects } from "@/core/api/subjects";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { EventActions } from "./EventActions";

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Usa AAAA-MM-DD HH:mm.");
const formSchema = z.object({
  title: z.string().trim().min(1, "Escribe un título.").max(200),
  description: z.string().trim().max(10000),
  kind: z.enum(["class", "work", "appointment", "personal", "unavailable", "other"]),
  subjectId: z.union([z.literal(""), z.uuid()]),
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

export function EventFormScreen({ id }: { id?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const event = useQuery({
    queryKey: ["calendar-event", id],
    queryFn: () => getCalendarEvent(id ?? ""),
    enabled: !!id,
    retry: false,
  });

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">{id ? "Evento fijo" : "Nuevo evento fijo"}</Text>
      {(profile.isPending || (id && event.isPending)) && (
        <ActivityIndicator accessibilityLabel="Cargando evento" />
      )}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{profile.error.message}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar perfil</Button>
        </View>
      )}
      {id && event.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{event.error.message}</Text>
          <Button onPress={() => void event.refetch()}>Reintentar evento</Button>
        </View>
      )}
      {profile.data && (!id || event.data) && (
        <EventForm
          key={`${event.data?.id ?? "new"}-${event.data?.version ?? 0}`}
          event={event.data}
          profile={profile.data}
        />
      )}
    </ScreenLayout>
  );
}

function EventForm({ event, profile }: { event?: CalendarEvent; profile: Profile }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [kindMenuOpen, setKindMenuOpen] = useState(false);
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const requestIdentity = useRef({ fingerprint: "", id: uuidv4() });
  const subjects = useInfiniteQuery({
    queryKey: ["subjects", false],
    queryFn: ({ pageParam }) => listSubjects(false, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !offline,
    retry: false,
  });
  const subjectItems = subjects.data?.pages.flatMap((page) => page.items) ?? [];
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: event?.title ?? "",
      description: event?.description ?? "",
      kind: event?.kind ?? "class",
      subjectId: event?.subjectId ?? "",
      startsLocal: event
        ? utcToLocalDateTime(event.startsAt, event.timeZone).replace("T", " ")
        : "",
      endsLocal: event ? utcToLocalDateTime(event.endsAt, event.timeZone).replace("T", " ") : "",
      timeZone: event?.timeZone ?? profile.timeZone,
    },
  });
  const kind = watch("kind");
  const subjectId = watch("subjectId");
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        kind: values.kind,
        subjectId: values.subjectId || null,
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
        calendarEventCreateSchema.parse({ ...fields, id: requestIdentity.current.id }),
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
    <View style={styles.fields}>
      {event?.archivedAt && <Text>Evento archivado. Restáuralo para editarlo.</Text>}
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
      <HelperText type="error" visible={!!errors.title}>
        {errors.title?.message}
      </HelperText>
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
      <HelperText type="error" visible={!!errors.description}>
        {errors.description?.message}
      </HelperText>
      <Menu
        visible={kindMenuOpen}
        onDismiss={() => setKindMenuOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setKindMenuOpen(true)}
            accessibilityLabel="Elegir tipo de evento"
          >
            Tipo: {kindLabels[kind]}
          </Button>
        }
      >
        {Object.entries(kindLabels).map(([value, label]) => (
          <Menu.Item
            key={value}
            title={label}
            onPress={() => {
              setValue("kind", value as FormValues["kind"]);
              setKindMenuOpen(false);
            }}
          />
        ))}
      </Menu>
      <Menu
        visible={subjectMenuOpen}
        onDismiss={() => setSubjectMenuOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setSubjectMenuOpen(true)}
            accessibilityLabel="Elegir materia"
          >
            Materia: {subjectItems.find((item) => item.id === subjectId)?.name ?? "Ninguna"}
          </Button>
        }
      >
        <Menu.Item
          title="Ninguna"
          onPress={() => {
            setValue("subjectId", "");
            setSubjectMenuOpen(false);
          }}
        />
        {subjectItems.map((item) => (
          <Menu.Item
            key={item.id}
            title={item.name}
            onPress={() => {
              setValue("subjectId", item.id);
              setSubjectMenuOpen(false);
            }}
          />
        ))}
        {subjects.hasNextPage && (
          <Menu.Item title="Cargar más materias" onPress={() => void subjects.fetchNextPage()} />
        )}
      </Menu>
      {subjects.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{subjects.error.message}</Text>
          <Button onPress={() => void subjects.refetch()}>Reintentar materias</Button>
        </View>
      )}
      <Controller
        control={control}
        name="timeZone"
        render={({ field }) => (
          <TextInput
            label="Zona horaria IANA"
            mode="outlined"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.timeZone}
            autoCapitalize="none"
            accessibilityLabel="Zona horaria del evento"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.timeZone}>
        {errors.timeZone?.message}
      </HelperText>
      <Text variant="bodySmall">Horas en la zona indicada. Formato: AAAA-MM-DD HH:mm.</Text>
      <Controller
        control={control}
        name="startsLocal"
        render={({ field }) => (
          <TextInput
            label="Inicio"
            mode="outlined"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.startsLocal}
            placeholder="2026-09-23 08:00"
            accessibilityLabel="Inicio local del evento"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.startsLocal}>
        {errors.startsLocal?.message}
      </HelperText>
      <Controller
        control={control}
        name="endsLocal"
        render={({ field }) => (
          <TextInput
            label="Fin"
            mode="outlined"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.endsLocal}
            placeholder="2026-09-23 09:00"
            accessibilityLabel="Fin local del evento"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.endsLocal}>
        {errors.endsLocal?.message}
      </HelperText>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
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
  fields: { gap: layout.fieldGap },
  message: { gap: layout.itemGap },
});
