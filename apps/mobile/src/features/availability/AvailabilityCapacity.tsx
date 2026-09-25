import { zodResolver } from "@hookform/resolvers/zod";
import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { getAvailabilityCapacity } from "@/core/api/availability";
import { layout } from "@/core/theme/layout";
import { type ExclusiveDateRange, exclusiveDateRangeSchema } from "@/shared/date-range";

export function AvailabilityCapacity() {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [range, setRange] = useState<ExclusiveDateRange | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ExclusiveDateRange>({
    resolver: zodResolver(exclusiveDateRangeSchema),
    defaultValues: { from: "", through: "" },
  });
  const capacity = useQuery({
    queryKey: ["availability-capacity", range],
    queryFn: () => getAvailabilityCapacity(range?.from ?? "", range?.through ?? ""),
    enabled: !!range,
    retry: false,
  });
  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Capacidad disponible</Text>
      {(["from", "through"] as const).map((name) => (
        <View key={name}>
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label={name === "from" ? "Desde" : "Hasta"}
                placeholder="2026-10-01"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!errors[name]}
              />
            )}
          />
          <HelperText type="error" visible={!!errors[name]}>
            {errors[name]?.message}
          </HelperText>
        </View>
      ))}
      <Text variant="bodySmall">“Hasta” es el primer día fuera del cálculo.</Text>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para calcular.</Text>
      )}
      <Button mode="outlined" disabled={offline} onPress={() => void handleSubmit(setRange)()}>
        Calcular capacidad
      </Button>
      {capacity.isFetching && <ActivityIndicator accessibilityLabel="Calculando capacidad" />}
      {capacity.isError && <Text accessibilityRole="alert">{capacity.error.message}</Text>}
      {capacity.data && (
        <Card mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleLarge">{capacity.data.totalMinutes} minutos</Text>
            {capacity.data.daily.map((day) => (
              <Text key={day.date}>
                {day.date}: {day.availableMinutes} min
              </Text>
            ))}
          </Card.Content>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
