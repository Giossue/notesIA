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
