import { Prisma } from "src/generated/prisma/client";

export function decimalToMoneyString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce(
    (acc, value) => acc.add(value),
    new Prisma.Decimal(0)
  );
}

export function multiplyLineTotal(
  unitPrice: Prisma.Decimal,
  quantity: number
): Prisma.Decimal {
  return unitPrice.mul(quantity);
}
