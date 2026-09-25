import {
  Children,
  type ComponentProps,
  type ComponentRef,
  forwardRef,
  type ReactNode,
} from "react";

import {
  Button as PaperButton,
  Card as PaperCard,
  Dialog as PaperDialog,
  Menu as PaperMenu,
  TextInput as PaperTextInput,
  useTheme,
} from "react-native-paper";
import { layout } from "@/core/theme/layout";

// Paper deriva el radio de cada componente multiplicando `theme.roundness`
// por un factor distinto (botón ×5, diálogo ×7, tarjeta ×3, campo ×1).
// El tema fija botones y segmentados en `layout.cardRadius`; estos envoltorios
// llevan el resto al mismo radio. Importa estos componentes desde aquí.
const radius = { borderRadius: layout.cardRadius };

type CardProps = ComponentProps<typeof PaperCard>;
function CardBase(props: CardProps) {
  const theme = useTheme();
  // Fondo blanco en todos los modos: `contained` usaría el gris `surfaceVariant`.
  // Las props de Card son una unión por `mode`; se reconstruye sin perder el tipo.
  const merged = {
    ...props,
    style: [radius, { backgroundColor: theme.colors.surface }, props.style],
  } as CardProps;
  return <PaperCard {...merged} />;
}
export const Card = Object.assign(CardBase, {
  Content: PaperCard.Content,
  Title: PaperCard.Title,
  Actions: PaperCard.Actions,
  Cover: PaperCard.Cover,
});

// Todo botón lleva ícono a la izquierda. Si no se indica, se deduce del verbo
// con que empieza su texto; lo que no encaja usa una flecha genérica.
const buttonIcons: Array<[RegExp, string]> = [
  [/^(guardar)/i, "content-save-outline"],
  [/^(crear|nueva|nuevo)/i, "plus"],
  [/^reintentar|^sincronizar/i, "refresh"],
  [/^cargar más/i, "chevron-down"],
  [/^cargar/i, "download-outline"],
  [/^(cancelar|cerrar|descartar cambio)/i, "close"],
  [/^(eliminar|descartar)/i, "delete-outline"],
  [/^quitar/i, "minus-circle-outline"],
  [/^archivar/i, "archive-outline"],
  [/^restaurar/i, "restore"],
  [/^editar/i, "pencil-outline"],
  [/^abrir/i, "open-in-new"],
  [/^revisar/i, "eye-outline"],
  [/^desbloquear/i, "lock-open-outline"],
  [/^bloquear/i, "lock-outline"],
  [/^marcar/i, "check-all"],
  [/^revocar/i, "shield-off-outline"],
  [/^rechazar/i, "close-circle-outline"],
  [/^generar|^solicitar sugerencia/i, "auto-fix"],
  [/^(solicitar|enviar)/i, "send-outline"],
  [/^exportar/i, "download-outline"],
  [/^registrar/i, "timer-outline"],
  [/^calcular/i, "calculator-variant-outline"],
  [/^consultar/i, "chart-bar"],
  [/^(iniciar sesión|ya tengo cuenta|volver a iniciar)/i, "login"],
  [/^volver/i, "arrow-left"],
  [/^reenviar/i, "email-sync-outline"],
  [/^ya verifiqué/i, "email-check-outline"],
  [/^olvidé/i, "lock-reset"],
  [/^(confirmar|aceptar|aceptado|aplicar|usar|listo|subtareas creadas)/i, "check"],
  // Selectores del tipo "Materia: Ninguna".
  [/^[^:]{1,30}:/, "menu-down"],
];

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? child : ""))
    .join("")
    .trim();
}

export function buttonIconFor(label: string) {
  return buttonIcons.find(([pattern]) => pattern.test(label))?.[1] ?? "chevron-right";
}

type ButtonProps = ComponentProps<typeof PaperButton>;
export function Button(props: ButtonProps) {
  return <PaperButton {...props} icon={props.icon ?? buttonIconFor(textOf(props.children))} />;
}

const TextInputBase = forwardRef<
  ComponentRef<typeof PaperTextInput>,
  ComponentProps<typeof PaperTextInput>
>(function TextInput(props, ref) {
  const theme = useTheme();
  // Paper rellena el campo con `background` (gris); siempre blanco.
  return (
    <PaperTextInput
      ref={ref}
      {...props}
      style={[{ backgroundColor: theme.colors.surface }, props.style]}
      outlineStyle={[radius, props.outlineStyle]}
    />
  );
});
export const TextInput = Object.assign(TextInputBase, {
  Icon: PaperTextInput.Icon,
  Affix: PaperTextInput.Affix,
});

function DialogBase(props: ComponentProps<typeof PaperDialog>) {
  return <PaperDialog {...props} style={[radius, props.style]} />;
}
export const Dialog = Object.assign(DialogBase, {
  Title: PaperDialog.Title,
  Content: PaperDialog.Content,
  Actions: PaperDialog.Actions,
  ScrollArea: PaperDialog.ScrollArea,
  Icon: PaperDialog.Icon,
});

function MenuBase(props: ComponentProps<typeof PaperMenu>) {
  return <PaperMenu {...props} contentStyle={[radius, props.contentStyle]} />;
}
export const Menu = Object.assign(MenuBase, { Item: PaperMenu.Item });
