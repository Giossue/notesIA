import { expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { buildExportWorkbook } from "./xlsx";

test("el Excel trae una hoja en español por sección con datos y escapa el contenido", () => {
  const files = unzipSync(
    buildExportWorkbook([
      { name: "account", rows: [{ id: "u1", email: "ana@example.test" }] },
      { name: "roles", rows: [] },
      {
        name: "activities",
        rows: [
          { title: "Deber <Cálculo> & más", progressPercent: 40, isCompleted: false },
          { title: "Examen", progressPercent: 100, isCompleted: true },
        ],
      },
    ]),
  );
  const workbook = strFromU8(files["xl/workbook.xml"] as Uint8Array);
  expect(workbook).toContain('name="Cuenta"');
  expect(workbook).toContain('name="Actividades"');
  // Las secciones vacías no crean hoja.
  expect(workbook).not.toContain('name="Roles"');
  const activities = strFromU8(files["xl/worksheets/sheet2.xml"] as Uint8Array);
  expect(activities).toContain("Título");
  expect(activities).toContain("Progreso (%)");
  expect(activities).toContain("Deber &lt;Cálculo&gt; &amp; más");
  expect(activities).toContain("<v>40</v>");
  expect(activities).toContain(">Sí<");
  expect(files["xl/worksheets/sheet3.xml"]).toBeUndefined();
});
