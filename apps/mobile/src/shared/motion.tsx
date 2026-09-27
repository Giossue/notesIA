import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

/** Aparece subiendo y con fundido; `index` escalona varias en fila. */
export function FadeUp({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(shown, {
      toValue: 1,
      duration: 220,
      delay: index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, shown]);
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View style={[style, { opacity: shown, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/** Pulso que se repite (escala de 1 a `to`) mientras `active` es verdadero. */
export function usePulse(active: boolean, to = 1.12, duration = 900) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: to,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, to, duration, scale]);
  return scale;
}

/** Un salto corto (escala) cada vez que cambia `trigger`. */
export function useBounce(trigger: unknown) {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar el disparador
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.setValue(0.8);
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [trigger]);
  return scale;
}

/** Tres puntos que saltan uno tras otro: la IA está escribiendo. */
export function TypingDots({ color }: { color: string }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        140,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 260,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.delay(280),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots]);
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Escribiendo"
      style={{ flexDirection: "row", gap: 5, alignItems: "center", height: 16 }}
    >
      {dots.map((dot, index) => (
        <Animated.View
          // biome-ignore lint/suspicious/noArrayIndexKey: son siempre tres puntos fijos
          key={index}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
            opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            transform: [
              { translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
            ],
          }}
        />
      ))}
    </Animated.View>
  );
}
