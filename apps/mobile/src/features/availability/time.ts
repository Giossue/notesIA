export function clockToMinute(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Usa el formato HH:mm.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("La hora no es válida.");
  return hour * 60 + minute;
}

export function minuteToClock(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function parseWindows(value: string) {
  const text = value.trim();
  if (!text) return [];
  return text.split(",").map((part) => {
    const [start, end, extra] = part.trim().split("-");
    if (!start || !end || extra) throw new Error("Usa intervalos como 08:00-10:00.");
    const startMinute = clockToMinute(start.trim());
    const endMinute = clockToMinute(end.trim());
    if (endMinute <= startMinute)
      throw new Error("Cada intervalo debe terminar después de iniciar.");
    return { startMinute, endMinute };
  });
}

export function windowsToText(windows: Array<{ startMinute: number; endMinute: number }>) {
  return windows
    .map((item) => `${minuteToClock(item.startMinute)}-${minuteToClock(item.endMinute)}`)
    .join(", ");
}
