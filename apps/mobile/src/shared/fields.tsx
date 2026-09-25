import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { Menu, TextInput } from "./paper";
import { Tabs } from "./Tabs";

/** Bloque de un formulario con título pequeño. */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {title}
        </Text>
        {hint && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

/** Etiqueta pegada a un control que no la trae (pestañas, grupos). */
export function LabeledField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.labeled}>
      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        {label}
      </Text>
      {hint && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {hint}
        </Text>
      )}
      {children}
    </View>
  );
}

/** Campo de solo lectura con el mismo aspecto que un TextInput; al tocarlo abre algo. */
export function PressableField({
  label,
  value,
  icon,
  onPress,
  error,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  icon: string;
  onPress: () => void;
  error?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.flex}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? label}: ${value || "sin definir"}`}
      >
        <View pointerEvents="none">
          <TextInput
            mode="outlined"
            label={label}
            value={value}
            editable={false}
            error={error}
            right={<TextInput.Icon icon={icon} />}
          />
        </View>
      </Pressable>
    </View>
  );
}

/** Selector de una opción que se ve como un campo del formulario. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  footer,
  disabled,
}: {
  label: string;
  disabled?: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: boolean;
  /** Elementos extra al final del menú (por ejemplo, "Cargar más"). */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchorPosition="bottom"
      anchor={
        <PressableField
          label={label}
          value={options.find((option) => option.value === value)?.label ?? ""}
          icon="menu-down"
          error={error}
          onPress={() => !disabled && setOpen(true)}
        />
      }
    >
      {options.map((option) => (
        <Menu.Item
          key={option.value}
          title={option.label}
          leadingIcon={option.value === value ? "check" : undefined}
          onPress={() => {
            onChange(option.value);
            setOpen(false);
          }}
        />
      ))}
      {footer}
    </Menu>
  );
}

const dateLabel = new Intl.DateTimeFormat("es", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (value: Date) =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const fromDayKey = (key: string) => {
  const [year, month, date] = key.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1);
};

/** Día local "AAAA-MM-DD" elegido con el calendario nativo de Android. */
export function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}) {
  return (
    <View style={styles.row}>
      <PressableField
        label={label}
        value={value ? dateLabel.format(fromDayKey(value)) : ""}
        icon="calendar-blank-outline"
        error={error}
        onPress={() =>
          DateTimePickerAndroid.open({
            mode: "date",
            value: value ? fromDayKey(value) : new Date(),
            onValueChange: (_event, picked) => onChange(dayKey(picked)),
          })
        }
      />
    </View>
  );
}

/** Hora "HH:mm" elegida con el reloj nativo de Android (24 h). */
export function TimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}) {
  const [hours, minutes] = (value || "08:00").split(":").map(Number);
  return (
    <PressableField
      label={label}
      value={value}
      icon="clock-outline"
      error={error}
      onPress={() =>
        DateTimePickerAndroid.open({
          mode: "time",
          is24Hour: true,
          value: new Date(2000, 0, 1, hours ?? 0, minutes ?? 0),
          onValueChange: (_event, picked) =>
            onChange(`${pad(picked.getHours())}:${pad(picked.getMinutes())}`),
        })
      }
    />
  );
}

/**
 * Fecha y hora locales en formato "AAAA-MM-DD HH:mm" (o "" si es opcional y
 * está vacía), elegidas con el calendario y el reloj nativos de Android.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  optional,
  defaultTime = "23:59",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  optional?: boolean;
  /** Hora que se propone al elegir primero el día. */
  defaultTime?: string;
}) {
  const day = value.slice(0, 10);
  const time = value.slice(11, 16);
  const [hours, minutes] = (time || defaultTime).split(":").map(Number);
  const calendarDate = day ? fromDayKey(day) : undefined;
  const today = new Date();

  const pickDate = () =>
    DateTimePickerAndroid.open({
      mode: "date",
      value: calendarDate ?? today,
      onValueChange: (_event, picked) => onChange(`${dayKey(picked)} ${time || defaultTime}`),
    });
  const pickTime = () =>
    DateTimePickerAndroid.open({
      mode: "time",
      is24Hour: true,
      value: new Date(2000, 0, 1, hours ?? 0, minutes ?? 0),
      onValueChange: (_event, picked) => {
        onChange(`${day || dayKey(today)} ${pad(picked.getHours())}:${pad(picked.getMinutes())}`);
      },
    });

  return (
    <View style={styles.row}>
      <PressableField
        label={label}
        value={calendarDate ? dateLabel.format(calendarDate) : ""}
        icon="calendar-blank-outline"
        error={error}
        onPress={pickDate}
      />
      <View style={styles.time}>
        <PressableField
          label="Hora"
          accessibilityLabel={`Hora de ${label}`}
          value={time}
          icon="clock-outline"
          error={error}
          onPress={pickTime}
        />
      </View>
      {optional && value !== "" && (
        <IconButton
          icon="close"
          size={20}
          onPress={() => onChange("")}
          accessibilityLabel={`Quitar ${label}`}
          style={styles.clear}
        />
      )}
    </View>
  );
}

const durationPresets = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 h" },
  { value: "120", label: "2 h" },
  { value: "240", label: "4 h" },
];

/** Minutos de trabajo estimados: opciones rápidas o una cifra propia. */
export function DurationField({
  value,
  onChange,
  onBlur,
  error,
  label = "¿Cuánto tiempo te tomará?",
  hint = "Con esto se reservan bloques de estudio antes de la fecha límite.",
  optional = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: boolean;
  label?: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <LabeledField label={label} hint={hint}>
      <Tabs
        value={value}
        onValueChange={(preset) => onChange(optional && preset === value ? "" : preset)}
        buttons={durationPresets}
      />
      <TextInput
        label={optional ? "Otra duración (opcional)" : "Otra duración"}
        mode="outlined"
        keyboardType="number-pad"
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        error={error}
        right={<TextInput.Affix text="min" />}
        accessibilityLabel="Duración estimada en minutos"
        style={styles.durationInput}
      />
    </LabeledField>
  );
}

const styles = StyleSheet.create({
  // Ritmo fijo: 12 entre campos de una sección, 6 entre etiqueta y control.
  section: { gap: 12 },
  sectionHeading: { gap: 2, marginBottom: 2 },
  sectionTitle: { fontWeight: "700" },
  labeled: { gap: 6 },
  fieldLabel: { fontWeight: "600" },
  durationInput: { marginTop: 6 },
  flex: { flex: 1 },
  clear: { alignSelf: "center", marginHorizontal: -4, marginTop: 6 },
  row: { flexDirection: "row", gap: 10 },
  time: { width: 112 },
});
