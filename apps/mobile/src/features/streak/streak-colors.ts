/** Colores de la racha: iguales en tema claro y oscuro, como una llama. */
export const flame = {
  orange: "#FF9600",
  yellow: "#FFC800",
  ice: "#49C0F8",
  off: "#9AA0A6",
} as const;

export const dayLetters = ["L", "M", "M", "J", "V", "S", "D"];

export const daysLabel = (count: number) => (count === 1 ? "día" : "días");
