import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  establishment: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  establishmentCheckIn: { count: vi.fn(), create: vi.fn() },
  charge: { count: vi.fn() },
}));

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import {
  checkInWithPresentationToken,
  ensurePresentationToken,
  mergeVisitEvents,
  presentationUrl,
  visitDayKey,
} from "./presentation";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const NOW = new Date("2026-11-17T20:00:00.000Z");

describe("visitDayKey", () => {
  it("usa el día de la Ciudad de México, no el de UTC", () => {
    // 03:00 UTC del 18 = 21:00 del 17 en CDMX.
    expect(visitDayKey(new Date("2026-11-18T03:00:00.000Z"))).toBe("2026-11-17");
    expect(visitDayKey(new Date("2026-11-18T07:00:00.000Z"))).toBe("2026-11-18");
  });
});

describe("mergeVisitEvents", () => {
  it("cuenta días distintos y guarda la visita más reciente", () => {
    const visits = mergeVisitEvents([
      { establishment_id: "a", at: new Date("2026-11-17T18:00:00.000Z") },
      { establishment_id: "a", at: new Date("2026-11-17T19:00:00.000Z") },
      { establishment_id: "a", at: new Date("2026-11-15T19:00:00.000Z") },
      { establishment_id: "b", at: new Date("2026-11-16T19:00:00.000Z") },
    ]);
    expect(visits).toEqual([
      { establishment_id: "a", visits: 2, last_visit_at: "2026-11-17T19:00:00.000Z" },
      { establishment_id: "b", visits: 1, last_visit_at: "2026-11-16T19:00:00.000Z" },
    ]);
  });
});

describe("presentationUrl", () => {
  it("no duplica la diagonal", () => {
    expect(presentationUrl("https://tonki.mx/", TOKEN)).toBe(`https://tonki.mx/visita/${TOKEN}`);
  });
});

describe("checkInWithPresentationToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.establishment.findUnique.mockResolvedValue({
      establishment_id: "est-1",
      name: "El Campestre",
      admin_id: "admin-1",
    });
    prismaMock.establishmentCheckIn.count.mockResolvedValue(0);
    prismaMock.charge.count.mockResolvedValue(0);
    prismaMock.establishmentCheckIn.create.mockResolvedValue({});
  });

  it("rechaza un token con forma inválida sin tocar la base", async () => {
    const result = await checkInWithPresentationToken("user-1", "x", NOW);
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(prismaMock.establishment.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza un token que ya no existe (QR rotado)", async () => {
    prismaMock.establishment.findUnique.mockResolvedValue(null);
    const result = await checkInWithPresentationToken("user-1", TOKEN, NOW);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("no deja que el dueño se registre en su propio negocio", async () => {
    const result = await checkInWithPresentationToken("admin-1", TOKEN, NOW);
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(prismaMock.establishmentCheckIn.create).not.toHaveBeenCalled();
  });

  it("registra la primera visita con el día de CDMX", async () => {
    const result = await checkInWithPresentationToken("user-1", TOKEN, NOW);
    expect(prismaMock.establishmentCheckIn.create).toHaveBeenCalledWith({
      data: { user_id: "user-1", establishment_id: "est-1", day: "2026-11-17" },
    });
    expect(result).toEqual({
      ok: true,
      checkIn: {
        establishment_id: "est-1",
        establishment_name: "El Campestre",
        already_today: false,
        first_visit: true,
      },
    });
  });

  it("un consumo previo hace que no sea primera visita", async () => {
    prismaMock.charge.count.mockResolvedValue(1);
    const result = await checkInWithPresentationToken("user-1", TOKEN, NOW);
    expect(result).toMatchObject({ ok: true, checkIn: { first_visit: false } });
  });

  it("un segundo escaneo el mismo día no suma visita", async () => {
    prismaMock.establishmentCheckIn.count.mockResolvedValue(1);
    prismaMock.establishmentCheckIn.create.mockRejectedValue({ code: "P2002" });
    const result = await checkInWithPresentationToken("user-1", TOKEN, NOW);
    expect(result).toMatchObject({
      ok: true,
      checkIn: { already_today: true, first_visit: false },
    });
  });

  it("propaga errores que no son de duplicado", async () => {
    prismaMock.establishmentCheckIn.create.mockRejectedValue(new Error("db down"));
    await expect(checkInWithPresentationToken("user-1", TOKEN, NOW)).rejects.toThrow("db down");
  });
});

describe("ensurePresentationToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide completar el perfil si no hay negocio", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue(null);
    expect(await ensurePresentationToken("admin-1")).toMatchObject({ ok: false, status: 404 });
  });

  it("reutiliza el token existente", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue({
      establishment_id: "est-1",
      name: "El Campestre",
      presentation_token: TOKEN,
    });
    expect(await ensurePresentationToken("admin-1")).toMatchObject({ ok: true, token: TOKEN });
    expect(prismaMock.establishment.updateMany).not.toHaveBeenCalled();
  });

  it("crea el token solo si sigue vacío", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue({
      establishment_id: "est-1",
      name: "El Campestre",
      presentation_token: null,
    });
    prismaMock.establishment.updateMany.mockResolvedValue({ count: 1 });
    const result = await ensurePresentationToken("admin-1");
    expect(prismaMock.establishment.updateMany).toHaveBeenCalledWith({
      where: { establishment_id: "est-1", presentation_token: null },
      data: { presentation_token: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/) },
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("si otra pestaña ganó la carrera, devuelve su token", async () => {
    prismaMock.establishment.findFirst
      .mockResolvedValueOnce({ establishment_id: "est-1", name: "El Campestre", presentation_token: null })
      .mockResolvedValueOnce({ establishment_id: "est-1", name: "El Campestre", presentation_token: TOKEN });
    prismaMock.establishment.updateMany.mockResolvedValue({ count: 0 });
    expect(await ensurePresentationToken("admin-1")).toMatchObject({ ok: true, token: TOKEN });
  });

  it("rotar reemplaza el token aunque ya exista", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue({
      establishment_id: "est-1",
      name: "El Campestre",
      presentation_token: TOKEN,
    });
    prismaMock.establishment.updateMany.mockResolvedValue({ count: 1 });
    const result = await ensurePresentationToken("admin-1", { rotate: true });
    expect(prismaMock.establishment.updateMany).toHaveBeenCalledWith({
      where: { establishment_id: "est-1" },
      data: { presentation_token: expect.any(String) },
    });
    expect(result.ok && result.token).not.toBe(TOKEN);
  });
});
