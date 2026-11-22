/** Tonkis que el cliente puede gastar: lo acreditado menos lo apartado o ya entregado. */
export function spendableTonkis(earned: number, held: number): number {
  if (!Number.isFinite(earned) || !Number.isFinite(held)) return 0;
  const balance = Math.trunc(earned) - Math.trunc(held);
  return balance > 0 ? balance : 0;
}

export function ledgerInt(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
}
