import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import Svg, { Circle, G } from "react-native-svg";

export type Ring = { progress: number; color: string };

/** Anillos concéntricos de progreso; el primero es el exterior. */
export function ProgressRings({
  rings,
  size = 150,
  stroke = 12,
  gap = 6,
  children,
}: {
  rings: Ring[];
  size?: number;
  stroke?: number;
  gap?: number;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.svg}>
        {rings.map((ring, index) => {
          const radius = center - stroke / 2 - index * (stroke + gap);
          if (radius <= stroke / 2) return null;
          const progress = Math.min(1, Math.max(0, ring.progress));
          return (
            // Los anillos no se reordenan: la posición define el radio.
            // biome-ignore lint/suspicious/noArrayIndexKey: la posición es la identidad del anillo
            <G key={index}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={theme.colors.surfaceVariant}
                strokeWidth={stroke}
                fill="none"
              />
              {progress > 0 && (
                <FillingArc
                  center={center}
                  radius={radius}
                  stroke={stroke}
                  color={ring.color}
                  progress={progress}
                  delay={index * 90}
                />
              )}
            </G>
          );
        })}
      </Svg>
      {children && <View style={styles.center}>{children}</View>}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Arco de progreso que se llena animado al aparecer y cuando cambia el valor. */
function FillingArc({
  center,
  radius,
  stroke,
  color,
  progress,
  delay,
}: {
  center: number;
  radius: number;
  stroke: number;
  color: string;
  progress: number;
  delay: number;
}) {
  const circumference = 2 * Math.PI * radius;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: progress,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      // Las props de SVG no van por el hilo nativo.
      useNativeDriver: false,
    }).start();
  }, [progress, delay, fill]);
  const dashoffset = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  return (
    <AnimatedCircle
      cx={center}
      cy={center}
      r={radius}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={`${circumference} ${circumference}`}
      strokeDashoffset={dashoffset}
      transform={`rotate(-90 ${center} ${center})`}
    />
  );
}

const styles = StyleSheet.create({
  svg: { position: "absolute" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
