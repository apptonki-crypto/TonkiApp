import type { Product } from "src/generated/prisma/client";
import { decimalToMoneyString } from "src/lib/crm/decimal";
import type { CrmProduct } from "src/lib/crm/types";

export function mapProduct(row: Product): CrmProduct {
  return {
    product_id: row.product_id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    unit_price: decimalToMoneyString(row.unit_price),
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
