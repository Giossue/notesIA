export const riskReasonLabels: Record<string, string> = {
  deadline_passed: "El plazo ya venció.",
  work_unscheduled: "Parte del trabajo no pudo ubicarse en el plan.",
  capacity_deficit: "Falta capacidad disponible antes del plazo.",
  low_margin: "El margen disponible es reducido.",
};

export const riskLevelLabels = {
  low: "bajo",
  medium: "medio",
  high: "alto",
} as const;

export const planStatusLabels = {
  draft: "propuesta",
  active: "activo",
  superseded: "reemplazado",
  rejected: "rechazado",
} as const;

export function riskReasonLabel(reason: string) {
  return riskReasonLabels[reason] ?? reason;
}
