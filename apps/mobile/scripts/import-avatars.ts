// Importa los avatares SVG del perfil.
//
//   bun apps/mobile/scripts/import-avatars.ts <carpeta-con-svg>
//
// React Native no interpreta <style> dentro de un SVG, así que cada regla CSS
// (.clase{fill:…}) se convierte en atributos del elemento. Escribe:
//   - apps/mobile/assets/avatars/<id>.svg          SVG limpios (fuente versionada)
//   - apps/mobile/src/shared/avatars.generated.ts  XML listo para <SvgXml>
//   - packages/contracts/src/avatars.generated.ts  IDs válidos para la API
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const DEFAULT_AVATAR = "avatar-coffee-cup";
const root = join(import.meta.dir, "..", "..", "..");
const source = process.argv[2];
if (!source) throw new Error("Indica la carpeta con los SVG");

function avatarId(file: string) {
  return basename(file, ".svg")
    .replace(/-svgrepo-com$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inlineStyles(svg: string) {
  const style = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const rules: Array<{ classes: string[]; declarations: Array<[string, string]> }> = [];
  for (const [, selectors = "", body = ""] of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const classes = selectors.split(",").map((selector) => {
      const name = selector.trim().match(/^\.([\w-]+)$/)?.[1];
      if (!name) throw new Error(`Selector no soportado: ${selector.trim()}`);
      return name;
    });
    const declarations = body
      .split(";")
      .map((part) => part.split(":").map((value) => value.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1]);
    rules.push({ classes, declarations });
  }

  return svg.replace(/<([a-zA-Z]+)(\s[^>]*?)?(\/?)>/g, (tag, name: string, attrs = "", end) => {
    const classes = attrs.match(/\sclass="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
    if (classes.length === 0) return tag;
    // Mismo peso de selector: gana la regla que aparece después, como en CSS.
    const props = new Map<string, string>();
    for (const rule of rules)
      if (rule.classes.some((item) => classes.includes(item)))
        for (const [prop, value] of rule.declarations) props.set(prop, value);
    let result = attrs.replace(/\sclass="[^"]*"/, "");
    for (const [prop, value] of props) {
      // CSS pesa más que el atributo de presentación: se reemplaza si ya existía.
      result = result.replace(new RegExp(`\\s${prop}="[^"]*"`), "");
      result += ` ${prop}="${value}"`;
    }
    return `<${name}${result}${end}>`;
  });
}

function clean(svg: string, id: string) {
  const title = `Avatar ${id.replaceAll("-", " ")}`;
  return inlineStyles(svg)
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<title>[\s\S]*?<\/title>|<title\s*\/>/g, "")
    .replace(/<defs>\s*<\/defs>/g, "")
    .replace(/<svg([^>]*)>/, (_, attrs: string) => {
      const viewBox = attrs.match(/viewBox="([^"]*)"/)?.[1] ?? "0 0 128 128";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img"><title>${title}</title>`;
    })
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const files = readdirSync(source)
  .filter((file) => file.endsWith(".svg"))
  .sort();
const avatars = files.map((file) => {
  const id = avatarId(file);
  return { id, xml: clean(readFileSync(join(source, file), "utf8"), id) };
});
const ids = avatars.map((avatar) => avatar.id);
if (new Set(ids).size !== ids.length) throw new Error("Hay dos avatares con el mismo id");
if (!ids.includes(DEFAULT_AVATAR)) throw new Error(`Falta el avatar por defecto ${DEFAULT_AVATAR}`);
for (const avatar of avatars)
  if (/<style|class=/.test(avatar.xml)) throw new Error(`Quedó CSS sin convertir en ${avatar.id}`);

const assets = join(root, "apps/mobile/assets/avatars");
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
for (const avatar of avatars) writeFileSync(join(assets, `${avatar.id}.svg`), `${avatar.xml}\n`);

const header = "// Generado por apps/mobile/scripts/import-avatars.ts. No editar a mano.\n";
writeFileSync(
  join(root, "packages/contracts/src/avatars.generated.ts"),
  `${header}export const avatarIds = ${JSON.stringify(ids, null, 2)} as const;\n\nexport const defaultAvatarId = "${DEFAULT_AVATAR}";\n`,
);
writeFileSync(
  join(root, "apps/mobile/src/shared/avatars.generated.ts"),
  `${header}import type { AvatarId } from "@notesia/contracts";\n\nexport const avatarXml: Record<AvatarId, string> = {\n${avatars
    .map((avatar) => `  ${JSON.stringify(avatar.id)}: ${JSON.stringify(avatar.xml)},`)
    .join("\n")}\n};\n`,
);
console.log(`${avatars.length} avatares importados; por defecto: ${DEFAULT_AVATAR}`);
