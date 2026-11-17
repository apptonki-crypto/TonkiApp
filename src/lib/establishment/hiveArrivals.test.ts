import { describe, expect, it } from "vitest";

import { diffHiveArrivals, planHiveArrivals } from "src/lib/establishment/hiveArrivals";

const visit = (establishment_id: string, visits: number) => ({
  establishment_id,
  visits,
  last_visit_at: "2026-11-17T18:00:00.000Z",
});

describe("diffHiveArrivals", () => {
  it("no anima nada la primera vez que el navegador ve el panal", () => {
    expect(diffHiveArrivals(null, [visit("a", 2)])).toEqual([]);
  });

  it("detecta una celda nueva y una visita más", () => {
    expect(diffHiveArrivals({ b: 1 }, [visit("a", 1), visit("b", 2)])).toEqual([
      { establishment_id: "a", kind: "new", via: "consumo" },
      { establishment_id: "b", kind: "more", via: "consumo" },
    ]);
  });

  it("ignora lugares sin cambios", () => {
    expect(diffHiveArrivals({ a: 2 }, [visit("a", 2)])).toEqual([]);
  });
});

describe("planHiveArrivals", () => {
  it("pone primero la llegada por QR y no la duplica con el diff", () => {
    const plan = planHiveArrivals(
      { establishment_id: "a", kind: "new", via: "qr" },
      { b: 1 },
      [visit("a", 1), visit("b", 2)]
    );
    expect(plan).toEqual([
      { establishment_id: "a", kind: "new", via: "qr" },
      { establishment_id: "b", kind: "more", via: "consumo" },
    ]);
  });

  it("sin registro previo usa el conteo para decidir si la celda es nueva", () => {
    expect(
      planHiveArrivals({ establishment_id: "a", kind: "new", via: "qr" }, null, [visit("a", 3)])
    ).toEqual([{ establishment_id: "a", kind: "more", via: "qr" }]);
  });

  it("descarta una llegada explícita de un lugar que no está entre las visitas", () => {
    expect(
      planHiveArrivals({ establishment_id: "x", kind: "new", via: "consumo" }, {}, [])
    ).toEqual([]);
  });

  it("limita a tres animaciones", () => {
    const visits = ["a", "b", "c", "d"].map((id) => visit(id, 1));
    expect(planHiveArrivals(null, {}, visits)).toHaveLength(3);
  });
});
