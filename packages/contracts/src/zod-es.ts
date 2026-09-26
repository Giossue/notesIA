import { z } from "zod";

/**
 * Mensajes de validación en español para todo el panel. Los casos comunes
 * tienen un texto propio y breve; el resto usa la traducción oficial de Zod.
 */
export function configureZodSpanish() {
  z.config({
    ...z.locales.es(),
    customError: (issue) => {
      switch (issue.code) {
        case "invalid_type":
          if (issue.input === undefined || issue.input === null || issue.input === "")
            return "Este campo es obligatorio";
          if (issue.expected === "number") return "Escribe un número";
          return undefined;
        case "too_small":
          if (issue.origin === "string")
            return Number(issue.minimum) <= 1
              ? "Este campo es obligatorio"
              : `Debe tener al menos ${issue.minimum} caracteres`;
          if (issue.origin === "number")
            return issue.inclusive
              ? `Debe ser mayor o igual a ${issue.minimum}`
              : `Debe ser mayor que ${issue.minimum}`;
          if (issue.origin === "array") return `Elige al menos ${issue.minimum}`;
          return undefined;
        case "too_big":
          if (issue.origin === "string")
            return `Debe tener como máximo ${issue.maximum} caracteres`;
          if (issue.origin === "number")
            return issue.inclusive
              ? `Debe ser menor o igual a ${issue.maximum}`
              : `Debe ser menor que ${issue.maximum}`;
          return undefined;
        case "invalid_format":
          if (issue.format === "email") return "Escribe un correo válido";
          if (issue.format === "uuid") return "Identificador no válido";
          if (issue.format === "url") return "Escribe una URL válida";
          if (issue.format === "regex") return "Formato no válido";
          return undefined;
        case "invalid_value":
          return "Elige una opción válida";
        case "not_multiple_of":
          return `Debe ser múltiplo de ${issue.divisor}`;
        case "custom":
          return issue.message && issue.message !== "Invalid input"
            ? issue.message
            : "Valor no válido";
        default:
          return undefined;
      }
    },
  });
}
