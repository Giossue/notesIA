import { type ActivityCategory, activityCategory } from "@notesia/contracts";
import type { CategoryColor } from "@/core/theme/theme";

/** Clasificación del requisito RF-10 con su nombre, color e ícono. */
export const categoryInfo: Record<
  ActivityCategory,
  { label: string; color: CategoryColor; icon: string }
> = {
  academic: { label: "Académica", color: "blue", icon: "school-outline" },
  personal: { label: "Personal", color: "pink", icon: "heart-outline" },
  daily: { label: "Cotidiana", color: "cyan", icon: "repeat" },
};

type Kind = "academic_task" | "exam" | "personal" | "routine";

/** Nombre visible de un tipo: el examen es una actividad académica más. */
export function kindLabel(kind: Kind) {
  return kind === "exam" ? "Examen" : categoryInfo[activityCategory(kind)].label;
}

export function kindColor(kind: Kind): CategoryColor {
  return categoryInfo[activityCategory(kind)].color;
}

/** Opciones al crear o editar: las tres clasificaciones del requisito. */
export const kindChoices = [
  { value: "academic_task", label: "Académica" },
  { value: "personal", label: "Personal" },
  { value: "routine", label: "Cotidiana" },
] as const;
