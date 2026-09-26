import { useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/paper";
import { HeroBackdrop, HeroStatusBar, heroColors } from "./AuthHero";

const slides = [
  {
    image: require("../../../assets/welcome/1.png"),
    title: "Organiza tus actividades",
    text: "Tareas, clases y eventos en un solo lugar, con fechas y prioridades claras.",
  },
  {
    image: require("../../../assets/welcome/2.png"),
    title: "Planifica tu tiempo",
    text: "Marca cuándo estás libre y recibe una propuesta de cuándo avanzar en cada actividad.",
  },
  {
    image: require("../../../assets/welcome/3.png"),
    title: "Registra tu tiempo",
    text: "Mide cuánto dedicas a cada actividad y revisa tu progreso semana a semana.",
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
              <Image
                source={slide.image}
                style={styles.image}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
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
  slide: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  art: { flex: 1, paddingTop: 24, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%", maxHeight: 420 },
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
