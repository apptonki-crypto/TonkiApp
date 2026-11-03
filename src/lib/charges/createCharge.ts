import { randomBytes } from "crypto";

import { Prisma } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import { CHARGE_STATUS_PENDING } from "src/lib/charges/constants";
import { renderChargeQrDataUrl } from "src/lib/charges/chargeQr";
import type { CreatedCharge } from "src/lib/charges/types";
import { chargeItemsSchema } from "src/lib/crm/schemas";
import {
  decimalToMoneyString,
  multiplyLineTotal,
  sumDecimals,
} from "src/lib/crm/decimal";
import {
  centsFromPesosInput,
  chargeExpiresAt,
  formatPesosFromCents,
  tonkisFromAmountCents,
} from "src/lib/charges/tonkis";

export type ChargeLineInput = {
  product_id: string;
  quantity: number;
};

export type CreateChargeResult =
  | { ok: true; charge: CreatedCharge }
  | { ok: false; status: number; error: string };

export function createChargeToken(): string {
  return randomBytes(24).toString("base64url");
}

function isUniqueConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function createConsumptionCharge(input: {
  adminId: string;
  amountRaw: string | null;
  origin: string;
  items?: unknown;
}): Promise<CreateChargeResult> {
  const establishment = await prisma.establishment.findFirst({
    where: { admin_id: input.adminId },
    orderBy: { created_at: "asc" },
    select: {
      establishment_id: true,
      cashback_percent: true,
    },
  });
  if (!establishment) {
    return {
      ok: false,
      status: 400,
      error: "No tienes un establecimiento configurado",
    };
  }

  let lineItemsData: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: Prisma.Decimal;
  }[] = [];

  if (input.items !== undefined && input.items !== null) {
    const parsedItems = chargeItemsSchema.safeParse(input.items);
    if (!parsedItems.success) {
      const first =
        parsedItems.error.issues[0]?.message ?? "Productos inválidos";
      return { ok: false, status: 400, error: first };
    }

    const productIds = [
      ...new Set(parsedItems.data.map((item) => item.product_id)),
    ];
    const products = await prisma.product.findMany({
      where: {
        establishment_id: establishment.establishment_id,
        admin_id: input.adminId,
        is_active: true,
        product_id: { in: productIds },
      },
      select: {
        product_id: true,
        name: true,
        unit_price: true,
      },
    });
    if (products.length !== productIds.length) {
      return {
        ok: false,
        status: 400,
        error: "Uno o más productos no existen o están inactivos",
      };
    }
    const byId = new Map(products.map((p) => [p.product_id, p]));

    lineItemsData = parsedItems.data.map((item) => {
      const product = byId.get(item.product_id)!;
      return {
        product_id: product.product_id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.unit_price,
      };
    });
  }

  let cents: number | null = null;
  if (lineItemsData.length > 0) {
    const total = sumDecimals(
      lineItemsData.map((line) =>
        multiplyLineTotal(line.unit_price, line.quantity)
      )
    );
    cents = centsFromPesosInput(decimalToMoneyString(total));
  } else {
    if (input.amountRaw === null || input.amountRaw.trim() === "") {
      return {
        ok: false,
        status: 400,
        error: "Escribe un monto o selecciona productos",
      };
    }
    cents = centsFromPesosInput(input.amountRaw);
  }

  if (cents === null) {
    return {
      ok: false,
      status: 400,
      error: "Escribe un monto en pesos mayor a 0, con hasta 2 decimales.",
    };
  }

  const points = tonkisFromAmountCents(cents, establishment.cashback_percent);
  if (points <= 0) {
    return {
      ok: false,
      status: 400,
      error:
        "Ese monto no alcanza para acreditar Tonkis con el porcentaje de tu negocio.",
    };
  }

  const amountLabel = formatPesosFromCents(cents);
  const amount = new Prisma.Decimal(amountLabel);
  const expiresAt = chargeExpiresAt();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = createChargeToken();
    const path = `/cobro/${token}`;
    const url = `${input.origin}${path}`;
    try {
      const qr_image = await renderChargeQrDataUrl(url);
      await prisma.charge.create({
        data: {
          establishment_id: establishment.establishment_id,
          admin_id: input.adminId,
          amount,
          cashback_percent: establishment.cashback_percent,
          token,
          expires_at: expiresAt,
          status: CHARGE_STATUS_PENDING,
          line_items:
            lineItemsData.length > 0
              ? {
                  create: lineItemsData.map((line) => ({
                    product_id: line.product_id,
                    product_name: line.product_name,
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                  })),
                }
              : undefined,
        },
      });
      return {
        ok: true,
        charge: {
          token,
          path,
          url,
          qr_image,
          amount: amountLabel,
          cashback_percent: establishment.cashback_percent,
          points,
          expires_at: expiresAt.toISOString(),
        },
      };
    } catch (err) {
      if (isUniqueConflict(err) && attempt === 0) continue;
      throw err;
    }
  }

  return { ok: false, status: 500, error: "No se pudo generar el código" };
}
