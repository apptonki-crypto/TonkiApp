import { z } from "zod";

export const createWaiterBillSchema = z.object({
  total_amount: z.coerce
    .number()
    .positive("El monto debe ser mayor a 0")
    .max(1_000_000, "Monto demasiado alto"),
});

export type CreateWaiterBillInput = z.infer<typeof createWaiterBillSchema>;
