import { describe, expect, it } from "vitest";

import { parsePostDynamicsCreate } from "src/lib/posts/dynamics/schemas";
import {
  buildDynamicCreates,
  normalizePostDynamics,
  type DynamicDraft,
} from "src/lib/posts/dynamicClient";

const ESTABLISHMENT = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";

const drafts: DynamicDraft[] = [
  {
    localId: "1",
    kind: "time_promo",
    text: "2x1 en café",
    startsAt: "2026-10-26T12:00:00.000Z",
    endsAt: "2026-10-27T12:00:00.000Z",
  },
  {
    localId: "2",
    kind: "going",
    text: "¿Vienes el viernes?",
    goalCount: "20",
    startsAt: "",
    endsAt: "2026-10-30T18:00:00.000Z",
  },
  {
    localId: "3",
    kind: "promo_code",
    code: "cafe26",
    maxRedemptions: "",
    benefit: "Postre gratis",
    startsAt: "",
    endsAt: "",
  },
  {
    localId: "4",
    kind: "qr",
    text: "Escanea y entra",
    goalCount: "15",
    startsAt: "",
    endsAt: "",
  },
  {
    localId: "5",
    kind: "consumption",
    establishmentId: ESTABLISHMENT,
    text: "",
    goalMode: "amount",
    goalCount: "",
    goalAmount: "500.50",
    minTicket: "80",
    productIds: [PRODUCT],
    startsAt: "",
    endsAt: "",
  },
];

describe("buildDynamicCreates", () => {
  it("matches postDynamicCreateSchema for every kind", () => {
    const built = buildDynamicCreates(drafts);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const parsed = parsePostDynamicsCreate(JSON.stringify(built.data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.map((item) => item.kind)).toEqual([
      "time_promo",
      "going",
      "promo_code",
      "qr",
      "consumption",
    ]);
    const promo = parsed.data[2];
    expect(promo).toMatchObject({
      kind: "promo_code",
      code: "CAFE26",
      max_redemptions: 1,
      benefit: "Postre gratis",
    });
    const consumption = parsed.data[4];
    expect(consumption).toMatchObject({
      kind: "consumption",
      establishment_id: ESTABLISHMENT,
      goal_mode: "amount",
      goal_amount: "500.50",
      min_ticket: "80.00",
      product_ids: [PRODUCT],
    });
  });

  it("rejects a time promo whose window is inverted", () => {
    const built = buildDynamicCreates([
      {
        localId: "1",
        kind: "time_promo",
        text: "Promo",
        startsAt: "2026-10-27T12:00:00.000Z",
        endsAt: "2026-10-26T12:00:00.000Z",
      },
    ]);
    expect(built).toEqual({
      ok: false,
      error: "Tiempo: La fecha de fin debe ser posterior al inicio",
    });
  });
});

describe("normalizePostDynamics", () => {
  it("accepts viewer_participated and viewerParticipated", () => {
    const dynamics = normalizePostDynamics([
      {
        dynamic_id: "dyn-1",
        kind: "going",
        phase: "active",
        text: "Ven",
        viewer_participated: true,
        progress_count: 2,
        goal_count: 10,
      },
      {
        dynamic_id: "dyn-2",
        kind: "promo_code",
        viewerParticipated: true,
        benefit: "Postre",
        progress_count: 0,
      },
    ]);
    expect(dynamics.map((item) => item.viewer_participated)).toEqual([true, true]);
    expect(dynamics[1]?.text).toBe("Postre");
    expect(dynamics[1]?.code).toBeNull();
  });

  it("reads an author code without requiring it", () => {
    const [dynamic] = normalizePostDynamics([
      {
        dynamic_id: "dyn-code",
        kind: "promo_code",
        phase: "active",
        code: "hola",
        participationCount: 0,
      },
    ]);
    expect(dynamic?.code).toBe("HOLA");
    expect(dynamic?.participation_count).toBe(0);
  });

  it("keeps a promo code out of the public summary unless the author payload asks for it", () => {
    const raw = {
      dynamic_id: "dyn-secret",
      kind: "promo_code",
      config: { code: "secreto", benefit: "Postre" },
      _count: { participations: 0 },
    };
    expect(normalizePostDynamics([raw])[0]?.code).toBeNull();
    expect(normalizePostDynamics([raw])[0]?.text).toBe("Postre");
    expect(
      normalizePostDynamics([raw], { includeAuthorSecrets: true })[0]?.code
    ).toBe("SECRETO");
    expect(
      normalizePostDynamics([raw], { includeAuthorSecrets: true })[0]
        ?.participation_count
    ).toBe(0);
  });
});
