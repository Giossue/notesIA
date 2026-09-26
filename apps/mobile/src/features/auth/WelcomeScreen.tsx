import { useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/paper";
import { AppLogo, HeroBackdrop, HeroStatusBar, heroColors } from "./AuthHero";

const slides = [
  {
    icon: "calendar-month-outline",
    title: "Organiza tus actividades",
    text: "Tareas, clases y eventos en un solo lugar, con fechas y prioridades claras.",
  },
  {
    icon: "auto-fix",
    title: "Planifica tu tiempo",
    text: "Marca cuándo estás libre y recibe una propuesta de cuándo avanzar en cada actividad.",
  },
  {
    icon: "chart-bar",
    title: "Mira cómo avanzas",
    text: "Registra el tiempo que dedicas y revisa tu progreso de cada semana.",
  },
] as const;

/** Presentación para quien recién instala la app; se muestra una sola vez. */
export function WelcomeScreen({ onDone }: { onDone(mode: "signIn" | "signUp"): void }) {
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === slides.length - 1;
  const goTo = (next: number) => {
    scroller.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  return (
    <SafeAreaView style={styles.page}>
      <HeroStatusBar />
      <HeroBackdrop height={height} />
      <View style={styles.top}>
        <AppLogo />
        {!last && (
          <Button
            mode="text"
            icon="page-last"
            textColor={heroColors.muted}
            onPress={() => goTo(slides.length - 1)}
          >
            Omitir
          </Button>
        )}
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {slides.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={styles.art}>
              <View style={[styles.ring, styles.ringOuter]} />
              <View style={[styles.ring, styles.ringInner]} />
              <View style={styles.badge}>
                <Icon source={slide.icon} size={56} color={heroColors.text} />
              </View>
            </View>
            <View style={styles.copy}>
              <Text variant="displaySmall" style={styles.title}>
                {slide.title}
              </Text>
              <Text variant="bodyLarge" style={styles.text}>
                {slide.text}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Paso ${index + 1} de ${slides.length}`}>
          {slides.map((slide, dot) => (
            <View key={slide.title} style={[styles.dot, dot === index && styles.dotActive]} />
          ))}
        </View>
        {last ? (
          <>
            <Button
              mode="contained"
              onPress={() => onDone("signUp")}
              style={styles.pill}
              contentStyle={styles.pillContent}
            >
              Crear cuenta
            </Button>
            <Button
              mode="contained"
              buttonColor="rgba(255, 255, 255, 0.12)"
              textColor={heroColors.text}
              onPress={() => onDone("signIn")}
              style={styles.pill}
              contentStyle={styles.pillContent}
            >
              Ya tengo cuenta
            </Button>
          </>
        ) : (
          <Button
            mode="contained"
            icon="chevron-right"
            onPress={() => goTo(index + 1)}
            style={styles.pill}
            contentStyle={[styles.pillContent, styles.iconRight]}
          >
            Siguiente
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: heroColors.background },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 12,
    minHeight: 64,
  },
  slide: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  art: { flex: 1, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  ringOuter: { width: 260, height: 260 },
  ringInner: {
    width: 190,
    height: 190,
    backgroundColor: "rgba(52, 104, 225, 0.12)",
  },
  badge: {
    width: 116,
    height: 116,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: heroColors.glow,
  },
  copy: { gap: 12, paddingBottom: 8 },
  title: { color: heroColors.text, fontWeight: "700" },
  text: { color: heroColors.muted },
  bottom: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, gap: 12 },
  dots: { flexDirection: "row", gap: 6, marginBottom: 8 },
  dot: {
    width: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  dotActive: { width: 28, backgroundColor: heroColors.text },
  pill: { borderRadius: 999 },
  pillContent: { minHeight: 52 },
  iconRight: { flexDirection: "row-reverse" },
});
