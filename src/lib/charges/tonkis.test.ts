import { describe, expect, it } from "vitest";

import {
  centsFromPesosInput,
  formatPesosFromCents,
  rewardDescriptionForCharge,
  tonkisFromAmountCents,
} from "./tonkis";

describe("tonkisFromAmountCents", () => {
  it("rounds half-up from peso cents times the frozen percent", () => {
    expect(tonkisFromAmountCents(10_000, 5)).toBe(5);
    expect(tonkisFromAmountCents(19_950, 5)).toBe(10);
    expect(tonkisFromAmountCents(1_900, 5)).toBe(1);
    expect(tonkisFromAmountCents(1_000, 1)).toBe(0);
    expect(tonkisFromAmountCents(100, 5)).toBe(0);
  });

  it("rejects non-positive amounts and percents outside 1–100", () => {
    expect(tonkisFromAmountCents(0, 5)).toBe(0);
    expect(tonkisFromAmountCents(-100, 5)).toBe(0);
    expect(tonkisFromAmountCents(10_000, 0)).toBe(0);
    expect(tonkisFromAmountCents(10_000, 101)).toBe(0);
  });
});

describe("centsFromPesosInput", () => {
  it("accepts pesos with up to two decimals", () => {
    expect(centsFromPesosInput("150")).toBe(15_000);
    expect(centsFromPesosInput("10.5")).toBe(1_050);
    expect(centsFromPesosInput("199.50")).toBe(19_950);
    expect(formatPesosFromCents(19_950)).toBe("199.50");
  });

  it("rejects zero, extra decimals, and blank input", () => {
    expect(centsFromPesosInput("0")).toBeNull();
    expect(centsFromPesosInput("0.00")).toBeNull();
    expect(centsFromPesosInput("10.555")).toBeNull();
    expect(centsFromPesosInput("")).toBeNull();
  });
});

describe("rewardDescriptionForCharge", () => {
  it("states the cashback is not a payment", () => {
    expect(rewardDescriptionForCharge(5, "150.00")).toContain("No es un pago");
    expect(rewardDescriptionForCharge(5, "150.00").length).toBeLessThanOrEqual(191);
  });
});
