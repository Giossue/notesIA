import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

/** Círculo con un sector relleno según el progreso (0–1). */
export function PieIcon({
  progress,
  color,
  size = 40,
}: {
  progress: number;
  color: string;
  size?: number;
}) {
  const center = size / 2;
  const ring = 2.5;
  const radius = center - ring - 3;
  const value = Math.min(1, Math.max(0, progress));
  const angle = value * 2 * Math.PI;
  const x = center + radius * Math.sin(angle);
  const y = center - radius * Math.cos(angle);
  const largeArc = value > 0.5 ? 1 : 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={center - ring / 2}
          stroke={color}
          strokeWidth={ring}
          fill="none"
        />
        {value >= 1 ? (
          <Circle cx={center} cy={center} r={radius} fill={color} />
        ) : (
          value > 0 && (
            <Path
              d={`M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y} Z`}
              fill={color}
            />
          )
        )}
      </Svg>
    </View>
  );
}
