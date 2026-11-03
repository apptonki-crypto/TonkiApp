/** How long a consumption QR stays claimable. */
export const CHARGE_TTL_MS = 15 * 60 * 1000;

export const CHARGE_STATUS_PENDING = "pending";
export const CHARGE_STATUS_CREDITED = "credited";

export const CHARGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function isChargeToken(token: string): boolean {
  return CHARGE_TOKEN_PATTERN.test(token);
}
