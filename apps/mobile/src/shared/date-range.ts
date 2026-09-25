import { shiftLocalDate } from "@notesia/domain";
import { z } from "zod";

export const exclusiveDateRangeSchema = z
  .object({
    from: z.iso.date("Usa AAAA-MM-DD."),
    through: z.iso.date("Usa AAAA-MM-DD."),
  })
  .superRefine((value, context) => {
    if (value.through <= value.from) {
      context.addIssue({
        code: "custom",
        path: ["through"],
        message: "El día final debe ser posterior al inicial.",
      });
      return;
    }
    if (value.through > shiftLocalDate(value.from, 31))
      context.addIssue({
        code: "custom",
        path: ["through"],
        message: "El rango admite como máximo 31 días.",
      });
  });

export type ExclusiveDateRange = z.infer<typeof exclusiveDateRangeSchema>;
