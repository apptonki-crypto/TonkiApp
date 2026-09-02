import { z } from "zod";
import type {
  BusinessHours,
  BusinessRegisterRequest,
  BusinessTypePreset,
} from "src/types/business";

export const BUSINESS_TYPE_PRESETS = [
  "food",
  "hardware",
  "store",
  "cafe",
  "bar",
  "services",
  "other",
] as const satisfies readonly BusinessTypePreset[];

export const BUSINESS_TYPE_LABELS: Record<
  Exclude<BusinessTypePreset, "other">,
  string
> = {
  food: "Venta de comida",
  hardware: "Ferretería",
  store: "Tienda",
  cafe: "Café",
  bar: "Bar",
  services: "Servicios",
};

const timeHhMm = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "hora inválida (HH:MM)")
  .refine((value) => {
    const [h, m] = value.split(":").map(Number);
    return h! >= 0 && h! <= 23 && m! >= 0 && m! <= 59;
  }, "hora inválida (HH:MM)");

const openDayHoursSchema = z
  .object({
    closed: z.literal(false),
    open: timeHhMm,
    close: timeHhMm,
  })
  .refine((day) => day.open < day.close, {
    message: "la hora de apertura debe ser anterior al cierre",
    path: ["close"],
  });

const closedDayHoursSchema = z.object({
  closed: z.literal(true),
});

const dayHoursSchema = z.union([closedDayHoursSchema, openDayHoursSchema]);

export const businessHoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
}) satisfies z.ZodType<BusinessHours>;

export const businessRegisterSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(1, "nombre de negocio requerido")
      .max(150, "nombre de negocio demasiado largo"),
    adminName: z
      .string()
      .trim()
      .min(1, "nombre de administrador requerido")
      .max(100, "nombre de administrador demasiado largo"),
    businessType: z.enum(BUSINESS_TYPE_PRESETS),
    customBusinessType: z
      .string()
      .trim()
      .max(100, "tipo de negocio demasiado largo")
      .optional(),
    email: z
      .string()
      .trim()
      .email("correo inválido")
      .max(100, "correo demasiado largo"),
    phone: z
      .string()
      .trim()
      .min(7, "teléfono inválido")
      .max(30, "teléfono demasiado largo")
      .regex(/^[+\d][\d\s()-]*$/, "teléfono inválido"),
    hours: businessHoursSchema,
    password: z
      .string()
      .min(8, "la contraseña debe tener al menos 8 caracteres")
      .max(500, "contraseña demasiado larga"),
  })
  .superRefine((data, ctx) => {
    if (data.businessType === "other") {
      if (!data.customBusinessType || data.customBusinessType.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["customBusinessType"],
          message: "escribe tu tipo de negocio",
        });
      }
    }
  }) satisfies z.ZodType<BusinessRegisterRequest>;

export type BusinessRegisterInput = z.infer<typeof businessRegisterSchema>;

export function resolveBusinessCategory(
  businessType: BusinessTypePreset,
  customBusinessType?: string
): string {
  if (businessType === "other") {
    return (customBusinessType ?? "").trim();
  }
  return BUSINESS_TYPE_LABELS[businessType];
}
