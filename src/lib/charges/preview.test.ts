import { describe, expect, it } from "vitest";

import { claimAvailability } from "./preview";

const base = {
  viewerType: "user",
  viewerId: "user-1",
  adminId: "admin-1",
  status: "pending",
  expired: false,
  points: 8,
  claimedByUserId: null,
  establishmentName: "El Campestre",
};

describe("claimAvailability", () => {
  it("lets a logged-in user claim a pending code", () => {
    expect(claimAvailability(base)).toEqual({
      can_claim: true,
      block_reason: null,
    });
  });

  it("blocks admins and a second credit", () => {
    expect(
      claimAvailability({ ...base, viewerType: "admin", viewerId: "admin-1" })
        .can_claim
    ).toBe(false);
    expect(
      claimAvailability({
        ...base,
        status: "credited",
        claimedByUserId: "user-2",
      }).block_reason
    ).toBe("Este código ya acreditó Tonkis.");
  });

  it("blocks a customer when another one already started paying", () => {
    expect(
      claimAvailability({ ...base, payerUserId: "user-2" }).block_reason
    ).toBe("Otro cliente ya está pagando este cobro.");
    expect(
      claimAvailability({ ...base, payerUserId: "user-1" }).can_claim
    ).toBe(true);
  });

  it("blocks payment when the business has no wallet", () => {
    expect(
      claimAvailability({ ...base, businessWalletReady: false }).can_claim
    ).toBe(false);
  });

  it("lets the payer finish crediting after the code expired", () => {
    const paid = {
      ...base,
      expired: true,
      payerUserId: "user-1",
      payStatus: "confirmed",
    };
    expect(claimAvailability(paid).can_claim).toBe(true);
    expect(
      claimAvailability({ ...paid, payStatus: "awaiting" }).can_claim
    ).toBe(false);
  });

  it("blocks a result of zero Tonkis", () => {
    expect(claimAvailability({ ...base, points: 0 }).block_reason).toBe(
      "Este consumo no alcanza para acreditar Tonkis."
    );
  });
});
