import { describe, expect, it } from "vitest";

import { establishmentUpsertSchema } from "./schemas";

describe("establishmentUpsertSchema", () => {
  it("defaults cashback to 5 and clears blank address", () => {
    const parsed = establishmentUpsertSchema.parse({
      name: "  El Campestre  ",
      address: "   ",
      category: "Cafetería",
    });
    expect(parsed).toEqual({
      name: "El Campestre",
      address: null,
      category: "Cafetería",
      description: null,
      phone: null,
      website: null,
      hours: null,
      location_x: null,
      location_y: null,
      location_z: null,
      cashback_percent: 5,
    });
  });

  it("accepts public profile coordinates", () => {
    const parsed = establishmentUpsertSchema.parse({
      name: "Negocio",
      location_x: "-99.1332",
      location_y: "19.4326",
      location_z: "12.5",
      description: "Café de especialidad",
    });
    expect(parsed.location_x).toBeCloseTo(-99.1332);
    expect(parsed.location_y).toBeCloseTo(19.4326);
    expect(parsed.location_z).toBeCloseTo(12.5);
    expect(parsed.description).toBe("Café de especialidad");
  });

  it("rejects coordinates outside the valid range", () => {
    expect(
      establishmentUpsertSchema.safeParse({
        name: "Negocio",
        location_x: "200",
      }).success
    ).toBe(false);
    expect(
      establishmentUpsertSchema.safeParse({
        name: "Negocio",
        location_y: "91",
      }).success
    ).toBe(false);
  });

  it("accepts an integer percent from a form string", () => {
    const parsed = establishmentUpsertSchema.parse({
      name: "Negocio",
      address: "Calle 1",
      category: "",
      cashback_percent: "12",
    });
    expect(parsed.cashback_percent).toBe(12);
    expect(parsed.category).toBeNull();
    expect(parsed.location_x).toBeNull();
  });

  it("rejects percents outside 1–100", () => {
    expect(
      establishmentUpsertSchema.safeParse({
        name: "Negocio",
        cashback_percent: 0,
      }).success
    ).toBe(false);
    expect(
      establishmentUpsertSchema.safeParse({
        name: "Negocio",
        cashback_percent: 101,
      }).success
    ).toBe(false);
    expect(
      establishmentUpsertSchema.safeParse({
        name: "Negocio",
        cashback_percent: 5.5,
      }).success
    ).toBe(false);
  });
});
