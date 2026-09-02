import { describe, expect, it } from "vitest";
import {
  businessRegisterSchema,
  resolveBusinessCategory,
} from "src/lib/business/schemas";

const validHours = {
  mon: { closed: false, open: "09:00", close: "18:00" },
  tue: { closed: false, open: "09:00", close: "18:00" },
  wed: { closed: true },
  thu: { closed: false, open: "09:00", close: "18:00" },
  fri: { closed: false, open: "09:00", close: "22:00" },
  sat: { closed: false, open: "10:00", close: "14:00" },
  sun: { closed: true },
};

const basePayload = {
  businessName: "Tonki Café",
  adminName: "Ana Admin",
  businessType: "cafe" as const,
  email: "ana@tonki.io",
  phone: "+52 55 1234 5678",
  hours: validHours,
  password: "Secret123",
};

describe("businessRegisterSchema", () => {
  it("accepts a valid preset payload", () => {
    const parsed = businessRegisterSchema.safeParse(basePayload);
    expect(parsed.success).toBe(true);
  });

  it("requires customBusinessType when businessType is other", () => {
    const parsed = businessRegisterSchema.safeParse({
      ...basePayload,
      businessType: "other",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects open >= close", () => {
    const parsed = businessRegisterSchema.safeParse({
      ...basePayload,
      hours: {
        ...validHours,
        mon: { closed: false, open: "18:00", close: "09:00" },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects short passwords", () => {
    const parsed = businessRegisterSchema.safeParse({
      ...basePayload,
      password: "short",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("resolveBusinessCategory", () => {
  it("maps presets to Spanish labels", () => {
    expect(resolveBusinessCategory("food")).toBe("Venta de comida");
    expect(resolveBusinessCategory("hardware")).toBe("Ferretería");
  });

  it("uses custom text for other", () => {
    expect(resolveBusinessCategory("other", "  Librería  ")).toBe("Librería");
  });
});
