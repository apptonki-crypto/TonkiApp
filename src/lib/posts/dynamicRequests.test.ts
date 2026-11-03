import { describe, expect, it } from "vitest";

import {
  DYNAMIC_KIND_LOCKED_MESSAGE,
  DYNAMIC_PATCH_MAX_MESSAGE,
  DYNAMIC_REMOVE_BLOCKED_MESSAGE,
  MISSING_CONSUMPTION_ESTABLISHMENT,
  dynamicClaimUrl,
  interpretDynamicsPatch,
  isDynamicClaimToken,
  parseCreateDynamicsField,
  parseParticipateBody,
  planDynamicPatch,
  type ExistingDynamic,
  type ParsedDynamicsPatch,
} from "src/lib/posts/dynamicRequests";

const ESTABLISHMENT = "11111111-1111-4111-8111-111111111111";
const OTHER_ESTABLISHMENT = "22222222-2222-4222-8222-222222222222";
const GOING_ID = "33333333-3333-4333-8333-333333333333";
const QR_ID = "44444444-4444-4444-8444-444444444444";
const QR_TOKEN = "qrTokenValue_123456";

function existing(
  partial: Partial<ExistingDynamic> & Pick<ExistingDynamic, "dynamic_id" | "kind">
): ExistingDynamic {
  return {
    status: "active",
    participation_count: 0,
    establishment_id: null,
    token: null,
    ...partial,
  };
}

function goingInput(text = "¿Vienes?") {
  return { kind: "going", text, goal_count: 4 };
}

describe("parseCreateDynamicsField", () => {
  it("treats an empty field as no dynamics", () => {
    expect(parseCreateDynamicsField("", null)).toEqual({ ok: true, data: [] });
    expect(parseCreateDynamicsField(undefined, null)).toEqual({
      ok: true,
      data: [],
    });
  });

  it("parses going and qr without an establishment", () => {
    const parsed = parseCreateDynamicsField(
      JSON.stringify([
        goingInput(),
        { kind: "qr", text: "Escanea", goal_count: 2 },
      ]),
      null
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.map((item) => item.kind)).toEqual(["going", "qr"]);
  });

  it("rejects consumption when the admin has no establishment", () => {
    const parsed = parseCreateDynamicsField(
      [
        {
          kind: "consumption",
          establishment_id: OTHER_ESTABLISHMENT,
          goal_mode: "count",
          goal_count: 2,
        },
      ],
      null
    );
    expect(parsed).toEqual({
      ok: false,
      error: MISSING_CONSUMPTION_ESTABLISHMENT,
    });
  });

  it("stamps the author's establishment over a client id", () => {
    const parsed = parseCreateDynamicsField(
      JSON.stringify([
        {
          kind: "consumption",
          establishment_id: OTHER_ESTABLISHMENT,
          goal_mode: "amount",
          goal_amount: "80.5",
          text: "Consumo",
        },
      ]),
      ESTABLISHMENT
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data[0]).toMatchObject({
      kind: "consumption",
      establishment_id: ESTABLISHMENT,
      goal_amount: "80.50",
    });
  });

  it("rejects invalid JSON and more than five dynamics", () => {
    expect(parseCreateDynamicsField("{", null)).toEqual({
      ok: false,
      error: "Las dinámicas no tienen un JSON válido.",
    });
    const six = Array.from({ length: 6 }, () => goingInput());
    expect(parseCreateDynamicsField(six, null)).toEqual({
      ok: false,
      error: DYNAMIC_PATCH_MAX_MESSAGE,
    });
  });
});

describe("interpretDynamicsPatch", () => {
  const going = existing({ dynamic_id: GOING_ID, kind: "going" });

  it("creates when dynamic_id is omitted and keeps a QR token on replace", () => {
    const qr = existing({
      dynamic_id: QR_ID,
      kind: "qr",
      token: QR_TOKEN,
    });
    const result = interpretDynamicsPatch(
      {
        upserts: [
          { kind: "going", text: "Nueva" },
          { dynamic_id: QR_ID, kind: "qr", text: "Nuevo QR", goal_count: 9 },
        ],
      },
      [qr],
      null
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual([
      {
        type: "create",
        input: expect.objectContaining({ kind: "going", text: "Nueva" }),
      },
      {
        type: "replace",
        dynamic_id: QR_ID,
        token: QR_TOKEN,
        input: expect.objectContaining({ kind: "qr", text: "Nuevo QR", goal_count: 9 }),
      },
    ]);
  });

  it("rejects a kind change even after someone has participated", () => {
    const result = interpretDynamicsPatch(
      {
        upserts: [
          {
            dynamic_id: GOING_ID,
            kind: "promo_code",
            code: "hola",
            benefit: "Postre",
          },
        ],
      },
      [existing({ ...going, participation_count: 2 })],
      null
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: DYNAMIC_KIND_LOCKED_MESSAGE,
    });
  });

  it("ignores config edits once there is a participation or the dynamic is closed", () => {
    const participated = interpretDynamicsPatch(
      { upserts: [{ dynamic_id: GOING_ID, ...goingInput("Editada") }] },
      [existing({ ...going, participation_count: 1 })],
      null
    );
    const exhausted = interpretDynamicsPatch(
      { upserts: [{ dynamic_id: GOING_ID, ...goingInput("Editada") }] },
      [existing({ ...going, status: "exhausted" })],
      null
    );
    expect(participated).toMatchObject({ ok: true, ops: [] });
    expect(exhausted).toMatchObject({ ok: true, ops: [] });
  });

  it("closes an active dynamic and does not reopen a finished one", () => {
    const active = interpretDynamicsPatch(
      {
        close_ids: [GOING_ID],
        upserts: [{ dynamic_id: GOING_ID, ...goingInput("Ignorada") }],
      },
      [existing({ ...going, participation_count: 3 })],
      null
    );
    const finished = interpretDynamicsPatch(
      { close_ids: [GOING_ID] },
      [existing({ ...going, status: "expired" })],
      null
    );
    expect(active).toMatchObject({
      ok: true,
      ops: [{ type: "close", dynamic_id: GOING_ID }],
    });
    const editableAndClose = interpretDynamicsPatch(
      {
        close_ids: [GOING_ID],
        upserts: [{ dynamic_id: GOING_ID, ...goingInput("Texto final") }],
      },
      [going],
      null
    );
    expect(editableAndClose.ok).toBe(true);
    if (!editableAndClose.ok) return;
    expect(editableAndClose.ops.map((op) => op.type)).toEqual(["replace", "close"]);
    expect(finished).toMatchObject({ ok: true, ops: [] });
  });

  it("deletes only when nobody has participated", () => {
    const blocked = interpretDynamicsPatch(
      { remove_ids: [GOING_ID] },
      [existing({ ...going, participation_count: 1 })],
      null
    );
    const allowed = planDynamicPatch(
      [existing({ dynamic_id: "dyn-a", kind: "going" })],
      { upserts: [], close_ids: [], remove_ids: ["dyn-a"] }
    );
    expect(blocked).toMatchObject({
      ok: false,
      status: 409,
      error: DYNAMIC_REMOVE_BLOCKED_MESSAGE,
    });
    expect(allowed).toEqual({
      ok: true,
      ops: [{ type: "remove", dynamic_id: "dyn-a" }],
    });
  });

  it("counts the dynamics that remain after the patch", () => {
    const five = Array.from({ length: 5 }, (_, index) =>
      existing({ dynamic_id: `dyn-${index}`, kind: "time_promo" })
    );
    const overflow: ParsedDynamicsPatch = {
      upserts: [{ input: { kind: "going", text: "Una más" } as never }],
      close_ids: [],
      remove_ids: [],
    };
    expect(planDynamicPatch(five, overflow)).toMatchObject({
      ok: false,
      status: 400,
      error: DYNAMIC_PATCH_MAX_MESSAGE,
    });

    const swapped = planDynamicPatch(five, {
      upserts: [{ input: { kind: "going", text: "Reemplazo de cupo" } as never }],
      close_ids: [],
      remove_ids: ["dyn-0"],
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.ops.map((op) => op.type)).toEqual(["remove", "create"]);
  });

  it("rejects unknown, repeated, and contradictory ids", () => {
    expect(
      interpretDynamicsPatch(
        { upserts: [{ dynamic_id: QR_ID, ...goingInput() }] },
        [going],
        null
      )
    ).toMatchObject({ ok: false, status: 400, error: "Dinámica no encontrada." });

    expect(
      interpretDynamicsPatch(
        {
          upserts: [
            { dynamic_id: GOING_ID, ...goingInput("Uno") },
            { dynamic_id: GOING_ID, ...goingInput("Dos") },
          ],
        },
        [going],
        null
      )
    ).toMatchObject({ ok: false, status: 400, error: "La dinámica está repetida." });

    expect(
      interpretDynamicsPatch(
        {
          remove_ids: [GOING_ID],
          upserts: [{ dynamic_id: GOING_ID, ...goingInput() }],
        },
        [going],
        null
      )
    ).toMatchObject({
      ok: false,
      status: 400,
      error: "No puedes editar y eliminar la misma dinámica.",
    });

    expect(
      interpretDynamicsPatch(
        { remove_ids: [GOING_ID], close_ids: [GOING_ID] },
        [going],
        null
      )
    ).toMatchObject({
      ok: false,
      status: 400,
      error: "No puedes cerrar y eliminar la misma dinámica.",
    });
  });

  it("requires the author establishment only when creating consumption", () => {
    const missing = interpretDynamicsPatch(
      {
        upserts: [{ kind: "consumption", goal_mode: "count", goal_count: 1 }],
      },
      [],
      null
    );
    expect(missing).toMatchObject({
      ok: false,
      error: MISSING_CONSUMPTION_ESTABLISHMENT,
    });

    const row = existing({
      dynamic_id: GOING_ID,
      kind: "consumption",
      establishment_id: OTHER_ESTABLISHMENT,
    });
    const replaced = interpretDynamicsPatch(
      {
        upserts: [
          {
            dynamic_id: GOING_ID,
            kind: "consumption",
            goal_mode: "count",
            goal_count: 8,
            establishment_id: ESTABLISHMENT,
          },
        ],
      },
      [row],
      null
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.ops[0]).toMatchObject({
      type: "replace",
      input: { establishment_id: OTHER_ESTABLISHMENT, goal_count: 8 },
    });

    const created = interpretDynamicsPatch(
      JSON.stringify({
        upserts: [
          {
            kind: "consumption",
            establishment_id: OTHER_ESTABLISHMENT,
            goal_mode: "count",
            goal_count: 2,
          },
        ],
      }),
      [],
      ESTABLISHMENT
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.ops[0]).toMatchObject({
      type: "create",
      input: { establishment_id: ESTABLISHMENT },
    });

    const moved = interpretDynamicsPatch(
      {
        upserts: [
          {
            dynamic_id: GOING_ID,
            kind: "consumption",
            goal_mode: "count",
            goal_count: 4,
            establishment_id: OTHER_ESTABLISHMENT,
          },
        ],
      },
      [row],
      ESTABLISHMENT
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.ops[0]).toMatchObject({
      type: "replace",
      input: { establishment_id: ESTABLISHMENT },
    });
  });

  it("accepts a blank patch and uppercases promo codes", () => {
    expect(interpretDynamicsPatch("  ", [], null)).toMatchObject({
      ok: true,
      ops: [],
    });
    const result = interpretDynamicsPatch(
      {
        upserts: [
          { kind: "promo_code", code: "hola-1", benefit: "Café" },
        ],
      },
      [],
      null
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops[0]).toMatchObject({
      type: "create",
      input: { code: "HOLA-1", benefit: "Café" },
    });
  });
});

describe("participate and claim helpers", () => {
  it("accepts going and promo code, and rejects QR on the participate body", () => {
    expect(parseParticipateBody({ source: "going" })).toEqual({
      ok: true,
      source: "going",
    });
    expect(parseParticipateBody({ source: "promo_code", code: "ab" })).toEqual({
      ok: true,
      source: "promo_code",
      code: "ab",
    });
    expect(parseParticipateBody({ source: "qr" })).toMatchObject({
      ok: false,
      status: 400,
      error: "El código QR se reclama desde su enlace.",
    });
    expect(parseParticipateBody({ source: "charge" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("builds an absolute claim URL without a trailing slash", () => {
    expect(isDynamicClaimToken(QR_TOKEN)).toBe(true);
    expect(isDynamicClaimToken("short")).toBe(false);
    expect(isDynamicClaimToken(`${QR_TOKEN}/extra`)).toBe(false);
    expect(dynamicClaimUrl("https://tonki.io/", QR_TOKEN)).toBe(
      `https://tonki.io/dinamica/${QR_TOKEN}`
    );
  });
});
