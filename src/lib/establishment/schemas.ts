import { z } from "zod";

function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));
}

function optionalCoord(min: number, max: number, invalid: string) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === null) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: invalid });
        return z.NEVER;
      }
      return n;
    });
}

export const establishmentUpsertSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nombre requerido")
    .max(150, "Nombre demasiado largo"),
  address: optionalText(255, "Dirección demasiado larga"),
  category: optionalText(100, "Categoría demasiado larga"),
  description: optionalText(4000, "La descripción es demasiado larga"),
  phone: optionalText(30, "Teléfono demasiado largo"),
  website: optionalText(255, "Sitio web demasiado largo"),
  hours: optionalText(4000, "Horario demasiado largo"),
  location_x: optionalCoord(-180, 180, "La longitud (X) debe estar entre -180 y 180"),
  location_y: optionalCoord(-90, 90, "La latitud (Y) debe estar entre -90 y 90"),
  location_z: optionalCoord(-500, 9000, "La altura (Z) debe estar entre -500 y 9000"),
  cashback_percent: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") return 5;
      return typeof value === "number" ? value : Number(value);
    })
    .pipe(
      z
        .number()
        .int("El porcentaje debe ser entero")
        .min(1, "El porcentaje mínimo es 1")
        .max(100, "El porcentaje máximo es 100")
    ),
});

export type EstablishmentUpsertInput = z.infer<typeof establishmentUpsertSchema>;
