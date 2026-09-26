import { strToU8, zipSync } from "fflate";

/** Nombre de cada hoja: máximo 31 caracteres y sin \ / ? * [ ] : (regla de Excel). */
const sheetNames: Record<string, string> = {
  account: "Cuenta",
  roles: "Roles",
  profile: "Perfil",
  preferences: "Preferencias",
  notificationPreferences: "Avisos",
  activitySeries: "Actividades recurrentes",
  activities: "Actividades",
  activityHistory: "Historial de actividades",
  subtasks: "Subtareas",
  calendarEvents: "Compromisos",
  streakDays: "Racha",
  availabilityRules: "Disponibilidad",
  availabilityExceptions: "Excepciones",
  exceptionWindows: "Horarios de excepciones",
  plans: "Planes",
  planBlocks: "Bloques de planes",
  unscheduledWork: "Trabajo sin asignar",
  planRisks: "Riesgos de planes",
  currentRisks: "Riesgos actuales",
  timeEntries: "Registro de tiempo",
  notifications: "Notificaciones",
  pushDevices: "Dispositivos",
  deletionRequest: "Solicitud de eliminación",
  consents: "Consentimientos",
  aiUsage: "Uso de IA",
};

/** Encabezados comunes en español; lo que no esté aquí conserva su nombre técnico. */
const columnNames: Record<string, string> = {
  id: "ID",
  email: "Correo",
  displayName: "Nombre",
  language: "Idioma",
  timeZone: "Zona horaria",
  role: "Rol",
  title: "Título",
  description: "Descripción",
  kind: "Tipo",
  type: "Tipo",
  priority: "Prioridad",
  status: "Estado",
  decision: "Decisión",
  version: "Versión",
  startAfterAt: "Empezar desde",
  deadlineAt: "Fecha límite",
  startsAt: "Inicio",
  endsAt: "Fin",
  estimatedMinutes: "Minutos estimados",
  progressPercent: "Progreso (%)",
  completedAt: "Completada el",
  archivedAt: "Archivada el",
  deletedAt: "Eliminada el",
  createdAt: "Creado el",
  updatedAt: "Actualizado el",
  recordedAt: "Registrado el",
  readAt: "Leída el",
  isCompleted: "Completada",
  isLocked: "Bloqueado",
  activityId: "ID de actividad",
  planId: "ID de plan",
  seriesId: "ID de serie",
  documentId: "ID de documento",
  occursOn: "Fecha",
  date: "Fecha",
  weekday: "Día de la semana",
  startMinute: "Minuto de inicio",
  endMinute: "Minuto de fin",
  frequency: "Frecuencia",
  startOn: "Desde",
  throughOn: "Hasta",
  minSessionMinutes: "Sesión mínima (min)",
  maxSessionMinutes: "Sesión máxima (min)",
  maxDailyMinutes: "Máximo diario (min)",
  notificationsEnabled: "Notificaciones",
  pushNotificationsEnabled: "Avisos push",
  quietStartMinute: "Inicio de silencio (min)",
  quietEndMinute: "Fin de silencio (min)",
  deadlineLeadMinutes: "Aviso antes del plazo (min)",
  blockLeadMinutes: "Aviso antes del bloque (min)",
  platform: "Plataforma",
  requestedAt: "Solicitada el",
  executeAt: "Se ejecuta el",
  provider: "Proveedor",
  modelId: "Modelo",
  inputTokens: "Tokens de entrada",
  outputTokens: "Tokens de salida",
  costUsd: "Coste (USD)",
  durationMs: "Duración (ms)",
};

const escapeXml = (value: string) =>
  value
    // Caracteres de control que XML no admite.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: se eliminan a propósito
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function columnLetter(index: number) {
  let letters = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  return letters;
}

function cell(reference: string, value: unknown, header = false) {
  const style = header ? ' s="1"' : "";
  if (value === null || value === undefined) return `<c r="${reference}"${style}/>`;
  if (typeof value === "number" && Number.isFinite(value))
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  const text =
    typeof value === "boolean"
      ? value
        ? "Sí"
        : "No"
      : value instanceof Date
        ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(
    text.slice(0, 32767),
  )}</t></is></c>`;
}

function sheetXml(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    `<row r="1">${keys
      .map((key, index) => cell(`${columnLetter(index)}1`, columnNames[key] ?? key, true))
      .join("")}</row>`,
    ...rows.map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 2}">${keys
          .map((key, index) => cell(`${columnLetter(index)}${rowIndex + 2}`, row[key]))
          .join("")}</row>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${lines.join("")}</sheetData></worksheet>`;
}

/**
 * Libro de Excel con una hoja por sección que tenga datos. Se arma a mano
 * (un .xlsx es un ZIP de XML) para no depender de una librería de hojas de cálculo.
 */
export function buildExportWorkbook(
  sections: Array<{ name: string; rows: Record<string, unknown>[] }>,
) {
  const withData = sections.filter((section) => section.rows.length > 0);
  const sheets = withData.length > 0 ? withData : [{ name: "account", rows: [] }];
  const used = new Set<string>();
  const names = sheets.map((section) => {
    let name = (sheetNames[section.name] ?? section.name).slice(0, 31);
    for (let copy = 2; used.has(name); copy++) name = `${name.slice(0, 27)} ${copy}`;
    used.add(name);
    return name;
  });
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map(
        (name, index) =>
          `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((section, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(section.rows));
  });
  return zipSync(files, { level: 6 });
}
