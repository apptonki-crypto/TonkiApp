import { describe, expect, it } from "vitest";

import { ledgerInt, spendableTonkis } from "./balance";

describe("spendableTonkis", () => {
  it("subtracts held points from what was earned", () => {
    expect(spendableTonkis(100, 40)).toBe(60);
  });

  it("never goes below zero", () => {
    expect(spendableTonkis(10, 25)).toBe(0);
    expect(spendableTonkis(Number.NaN, 1)).toBe(0);
  });
});

describe("ledgerInt", () => {
  it("reads the shapes MySQL can return for a SUM", () => {
    expect(ledgerInt(12)).toBe(12);
    expect(ledgerInt(BigInt(12))).toBe(12);
    expect(ledgerInt("40")).toBe(40);
    expect(ledgerInt({ toNumber: () => 7.9 })).toBe(7);
    expect(ledgerInt(null)).toBe(0);
  });
});
