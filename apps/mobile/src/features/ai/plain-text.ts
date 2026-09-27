/**
 * Las respuestas de la IA se muestran como texto plano. Si el modelo igual manda
 * markdown, se limpia: negritas, títulos y viñetas pasan a texto con «•».
 */
export function plainText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/^[ \t]*(\d+)[.)][ \t]+/gm, "$1. ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
