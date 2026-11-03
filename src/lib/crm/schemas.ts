import { z } from "zod";

const pesosString = z
  .string()
  .trim()
  .min(1, "Escribe un precio")
  .refine((value) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }, "Precio inválido: usa hasta 2 decimales y mayor a 0");

export const productCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(150, "Máximo 150 caracteres"),
  sku: z
    .string()
    .trim()
    .max(64, "Máximo 64 caracteres")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  description: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  unit_price: pesosString,
});

export const productUpdateSchema = productCreateSchema
  .partial()
  .extend({
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No hay cambios",
  });

export const chargeLineItemSchema = z.object({
  product_id: z.string().uuid("Producto inválido"),
  quantity: z
    .number()
    .int("Cantidad entera")
    .min(1, "Mínimo 1")
    .max(999, "Máximo 999"),
});

export const chargeItemsSchema = z
  .array(chargeLineItemSchema)
  .min(1, "Agrega al menos un producto")
  .max(50, "Demasiadas líneas");

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
