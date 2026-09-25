import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";

const destinations = [
  [
    "Planning",
    "Planificación y riesgo",
    "Genera, revisa y aplica planes de estudio.",
    "calendar-clock",
  ],
  [
    "TimeTracking",
    "Tiempo y estadísticas",
    "Registra sesiones y consulta el tiempo real.",
    "timer-outline",
  ],
  [
    "Availability",
    "Disponibilidad",
    "Configura horarios semanales y excepciones.",
    "clock-outline",
  ],
  [
    "AcademicPeriods",
    "Periodos académicos",
    "Organiza materias por semestre o ciclo.",
    "calendar-range",
  ],
  ["ActivitySeries", "Actividades recurrentes", "Crea rutinas diarias o semanales.", "repeat"],
  [
    "AiAssistant",
    "Ayuda con IA",
    "Solicita sugerencias estructuradas para revisar.",
    "creation-outline",
  ],
  ["Notifications", "Notificaciones", "Revisa avisos y configura anticipaciones.", "bell-outline"],
  ["Preferences", "Preferencias", "Define duración de sesiones, jornada y avisos.", "tune-variant"],
  [
    "Privacy",
    "Privacidad y consentimientos",
    "Consulta documentos y controla el uso de IA.",
    "shield-account-outline",
  ],
  [
    "OfflineChanges",
    "Cambios sin conexión",
    "Revisa pendientes, fallos y conflictos de sincronización.",
    "cloud-sync-outline",
  ],
  [
    "Account",
    "Datos y cuenta",
    "Exporta tus datos o solicita eliminar la cuenta.",
    "account-cog-outline",
  ],
] as const;

export function ToolsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ScreenLayout>
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <View style={styles.heading}>
        <Text variant="headlineMedium">Herramientas</Text>
        <Text variant="bodyMedium">Accede a todas las funciones del planificador.</Text>
      </View>
      {destinations.map(([route, title, description, icon]) => (
        <Card
          key={route}
          mode="contained"
          onPress={() => navigation.navigate(route)}
          accessibilityLabel={`Abrir ${title}`}
        >
          <Card.Content style={styles.card}>
            <Text variant="titleMedium">{title}</Text>
            <Text variant="bodyMedium">{description}</Text>
            <Button
              compact
              icon={icon}
              onPress={() => navigation.navigate(route)}
              contentStyle={sharedStyles.actionContent}
            >
              Abrir
            </Button>
          </Card.Content>
        </Card>
      ))}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  heading: { gap: layout.itemGap },
  card: { gap: layout.itemGap },
});
