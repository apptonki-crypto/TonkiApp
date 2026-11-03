export function formatMxn(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
