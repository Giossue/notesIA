const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const weekdaysLong = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Día de la semana de una fecha local `YYYY-MM-DD`, sin depender de la zona del dispositivo. */
function weekdayIndex(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

export function shortWeekday(date: string) {
  return weekdays[weekdayIndex(date)] ?? "";
}

/** "Lunes, 28 de abril" */
export function longDate(date: string) {
  const [, month, day] = date.split("-").map(Number);
  const weekday = weekdaysLong[weekdayIndex(date)] ?? "";
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${day} de ${months[(month ?? 1) - 1]}`;
}

/** "22 – 28 abr" para un rango con fin exclusivo. */
export function shortRange(from: string, lastInclusive: string) {
  const [, fromMonth, fromDay] = from.split("-").map(Number);
  const [, toMonth, toDay] = lastInclusive.split("-").map(Number);
  const month = (value: number | undefined) => months[(value ?? 1) - 1]?.slice(0, 3) ?? "";
  return fromMonth === toMonth
    ? `${fromDay} – ${toDay} ${month(toMonth)}`
    : `${fromDay} ${month(fromMonth)} – ${toDay} ${month(toMonth)}`;
}

/** "9:00 a. m." a partir de "HH:mm". */
export function clockTime(hhmm: string) {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  const suffix = hours < 12 ? "a. m." : "p. m.";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}
