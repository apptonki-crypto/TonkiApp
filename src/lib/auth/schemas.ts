import { z } from "zod";

export const pollarSessionSchema = z.object({
  token: z.string().trim().min(1, "token requerido").max(8192),
  from: z.string().trim().max(500).optional(),
});

const isoDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m! - 1 &&
      dt.getUTCDate() === d
    );
  }, "fecha inválida");

const namePart = z
  .string()
  .trim()
  .min(1, "campo requerido")
  .max(50, "demasiado largo");

const optionalNamePart = z
  .string()
  .trim()
  .max(50, "demasiado largo")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : ""));

export const profileUpdateSchema = z.object({
  email: z
    .string()
    .trim()
    .email("correo inválido")
    .max(100, "correo demasiado largo"),
  first_name: namePart,
  paternal_surname: optionalNamePart,
  maternal_surname: optionalNamePart,
  birthDate: isoDateOnly,
});
