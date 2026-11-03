import {
  kindLabel,
  type DynamicDraft,
} from "src/lib/posts/dynamicClient";

export type DynamicProductOption = {
  product_id: string;
  name: string;
};

const inputClass =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-3 py-2 text-sm text-tonki-text outline-none focus:border-tonki-accent";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-tonki-text-muted";

function DateFields({
  startsAt,
  endsAt,
  required,
  onChange,
}: {
  startsAt: string;
  endsAt: string;
  required?: boolean;
  onChange: (next: { startsAt: string; endsAt: string }) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        {required ? "Inicio" : "Inicio (opcional)"}
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value, endsAt })}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        {required ? "Fin" : "Fin (opcional)"}
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(event) => onChange({ startsAt, endsAt: event.target.value })}
          className={inputClass}
        />
      </label>
    </div>
  );
}

export function DynamicDraftFields({
  draft,
  onChange,
  products,
  productsLoading,
  productsError,
  lockKind = false,
}: {
  draft: DynamicDraft;
  onChange: (next: DynamicDraft) => void;
  products?: DynamicProductOption[];
  productsLoading?: boolean;
  productsError?: string | null;
  lockKind?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-tonki-text">
        {kindLabel(draft.kind)}
        {lockKind ? (
          <span className="ml-2 text-xs font-medium text-tonki-text-muted">
            El tipo no se puede cambiar
          </span>
        ) : null}
      </p>

      {draft.kind === "time_promo" ? (
        <>
          <label className={labelClass}>
            Texto de la promo
            <textarea
              value={draft.text}
              maxLength={500}
              rows={2}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
              className={inputClass}
            />
          </label>
          <DateFields
            required
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            onChange={(next) => onChange({ ...draft, ...next })}
          />
        </>
      ) : null}

      {draft.kind === "going" ? (
        <>
          <label className={labelClass}>
            Texto
            <textarea
              value={draft.text}
              maxLength={500}
              rows={2}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Meta de personas (opcional)
            <input
              inputMode="numeric"
              value={draft.goalCount}
              onChange={(event) => onChange({ ...draft, goalCount: event.target.value })}
              className={inputClass}
            />
          </label>
          <DateFields
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            onChange={(next) => onChange({ ...draft, ...next })}
          />
        </>
      ) : null}

      {draft.kind === "promo_code" ? (
        <>
          <label className={labelClass}>
            Código
            <input
              value={draft.code}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onChange({ ...draft, code: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Máximo de redenciones
            <input
              inputMode="numeric"
              value={draft.maxRedemptions}
              onChange={(event) =>
                onChange({ ...draft, maxRedemptions: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Texto del beneficio
            <textarea
              value={draft.benefit}
              maxLength={500}
              rows={2}
              onChange={(event) => onChange({ ...draft, benefit: event.target.value })}
              className={inputClass}
            />
          </label>
          <DateFields
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            onChange={(next) => onChange({ ...draft, ...next })}
          />
        </>
      ) : null}

      {draft.kind === "qr" ? (
        <>
          <label className={labelClass}>
            Texto
            <textarea
              value={draft.text}
              maxLength={500}
              rows={2}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Meta de escaneos
            <input
              inputMode="numeric"
              value={draft.goalCount}
              onChange={(event) => onChange({ ...draft, goalCount: event.target.value })}
              className={inputClass}
            />
          </label>
          <DateFields
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            onChange={(next) => onChange({ ...draft, ...next })}
          />
        </>
      ) : null}

      {draft.kind === "consumption" ? (
        <>
          <label className={labelClass}>
            Texto (opcional)
            <textarea
              value={draft.text}
              maxLength={500}
              rows={2}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
              className={inputClass}
            />
          </label>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-xs font-medium text-tonki-text-muted">
              Meta
            </legend>
            <label className="flex items-center gap-2 text-sm text-tonki-text">
              <input
                type="radio"
                name={`goal-mode-${draft.localId}`}
                checked={draft.goalMode === "count"}
                onChange={() => onChange({ ...draft, goalMode: "count" })}
              />
              Por número de cobros
            </label>
            <label className="flex items-center gap-2 text-sm text-tonki-text">
              <input
                type="radio"
                name={`goal-mode-${draft.localId}`}
                checked={draft.goalMode === "amount"}
                onChange={() => onChange({ ...draft, goalMode: "amount" })}
              />
              Por monto
            </label>
          </fieldset>
          {draft.goalMode === "count" ? (
            <label className={labelClass}>
              Cobros que cierran la dinámica
              <input
                inputMode="numeric"
                value={draft.goalCount}
                onChange={(event) =>
                  onChange({ ...draft, goalCount: event.target.value })
                }
                className={inputClass}
              />
            </label>
          ) : (
            <label className={labelClass}>
              Monto que cierra la dinámica
              <input
                inputMode="decimal"
                value={draft.goalAmount}
                placeholder="150.00"
                onChange={(event) =>
                  onChange({ ...draft, goalAmount: event.target.value })
                }
                className={inputClass}
              />
            </label>
          )}
          <label className={labelClass}>
            Ticket mínimo (opcional)
            <input
              inputMode="decimal"
              value={draft.minTicket}
              placeholder="50.00"
              onChange={(event) => onChange({ ...draft, minTicket: event.target.value })}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-tonki-text-muted">
              Productos (opcional)
            </p>
            {productsLoading ? (
              <p className="text-xs text-tonki-text-muted">Cargando productos…</p>
            ) : productsError ? (
              <p className="text-xs text-tonki-danger">{productsError}</p>
            ) : (products?.length ?? 0) === 0 ? (
              <p className="text-xs text-tonki-text-muted">
                Sin productos activos. La dinámica aplica a cualquier cobro.
              </p>
            ) : (
              <>
                <ul className="m-0 flex max-h-40 list-none flex-col gap-1 overflow-y-auto rounded-xl border border-tonki-border p-2">
                  {products?.map((product) => {
                    const checked = draft.productIds.includes(product.product_id);
                    return (
                      <li key={product.product_id}>
                        <label className="flex items-center gap-2 text-sm text-tonki-text">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const productIds = checked
                                ? draft.productIds.filter((id) => id !== product.product_id)
                                : [...draft.productIds, product.product_id];
                              onChange({ ...draft, productIds });
                            }}
                          />
                          <span className="truncate">{product.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-tonki-text-muted">
                  Si no eliges productos, cuenta cualquier cobro.
                </p>
              </>
            )}
          </div>
          <DateFields
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            onChange={(next) => onChange({ ...draft, ...next })}
          />
        </>
      ) : null}
    </div>
  );
}
