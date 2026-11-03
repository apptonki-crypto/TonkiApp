"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  crmExportPath,
  fetchCrmOverview,
  fetchCrmProducts,
} from "src/lib/crm/fetchCrmClient";
import { formatCrmRangeLabel } from "src/lib/crm/mexicoCity";
import type {
  CrmAnalyticsQuery,
  CrmOverviewPayload,
  CrmPeriodPreset,
  CrmProduct,
  CrmStatusFilter,
} from "src/lib/crm/types";

import { CrmAnalyticsFilters } from "./CrmAnalyticsFilters";
import { CrmOverviewTab } from "./CrmOverviewTab";
import { CrmProductsTab } from "./CrmProductsTab";
import { CrmSalesTab } from "./CrmSalesTab";

type CrmTab = "overview" | "products" | "sales";

function exportFilename(
  query: CrmAnalyticsQuery,
  loaded: CrmOverviewPayload["filter"]
): string {
  if (query.preset === "custom" && query.from && query.to) {
    return `ventas-${query.from}-a-${query.to}.csv`;
  }
  if (loaded.preset === query.preset && loaded.status === query.status) {
    return `ventas-${loaded.from}-a-${loaded.to}.csv`;
  }
  return "ventas.csv";
}

function customRangeReady(from: string, to: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to
  );
}

export default function AdminCrmPage() {
  const router = useRouter();
  const requestSeq = useRef(0);
  const [gatePending, setGatePending] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<CrmTab>("overview");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overview, setOverview] = useState<CrmOverviewPayload | null>(null);
  const [products, setProducts] = useState<CrmProduct[]>([]);
  const [preset, setPreset] = useState<CrmPeriodPreset>("30d");
  const [status, setStatus] = useState<CrmStatusFilter>("credited");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const rangeReady =
    preset !== "custom" || customRangeReady(customFrom, customTo);
  const query: CrmAnalyticsQuery = {
    preset,
    status,
    from: preset === "custom" ? customFrom : null,
    to: preset === "custom" ? customTo : null,
  };

  const reloadOverview = useCallback(async () => {
    if (preset === "custom" && !customRangeReady(customFrom, customTo)) return;

    const seq = ++requestSeq.current;
    const overviewResult = await fetchCrmOverview({
      networkErrorMessage: "No se pudo cargar el CRM",
      query: {
        preset,
        status,
        from: preset === "custom" ? customFrom : null,
        to: preset === "custom" ? customTo : null,
      },
    });
    if (seq !== requestSeq.current) return;

    setRefreshing(false);
    setGatePending(false);
    if (!overviewResult.ok) {
      if (overviewResult.unauthorized) {
        router.replace("/login");
        return;
      }
      setLoadError(overviewResult.error);
      return;
    }

    setOverview(overviewResult.overview);
    setLoadError(null);
  }, [customFrom, customTo, preset, router, status]);

  useEffect(() => {
    async function load() {
      await reloadOverview();
    }
    void load();
    return () => {
      requestSeq.current += 1;
    };
  }, [reloadOverview]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const productsResult = await fetchCrmProducts({
        networkErrorMessage: "No se pudieron cargar los productos",
        includeInactive: true,
      });
      if (cancelled) return;
      if (!productsResult.ok) {
        if (productsResult.unauthorized) router.replace("/login");
        return;
      }
      setProducts(productsResult.products);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const choosePreset = (next: CrmPeriodPreset) => {
    const from = next === "custom" ? customFrom || overview?.filter.from || "" : customFrom;
    const to = next === "custom" ? customTo || overview?.filter.to || "" : customTo;
    if (next === preset && from === customFrom && to === customTo) return;
    if (next === "custom") {
      setCustomFrom(from);
      setCustomTo(to);
    }
    if (next !== "custom" || customRangeReady(from, to)) setRefreshing(true);
    setPreset(next);
  };

  const chooseStatus = (next: CrmStatusFilter) => {
    if (next === status) return;
    if (preset !== "custom" || customRangeReady(customFrom, customTo)) {
      setRefreshing(true);
    }
    setStatus(next);
  };

  const changeFrom = (value: string) => {
    setRefreshing(customRangeReady(value, customTo));
    setCustomFrom(value);
  };

  const changeTo = (value: string) => {
    setRefreshing(customRangeReady(customFrom, value));
    setCustomTo(value);
  };

  const refreshAfterWrite = () => {
    if (preset === "custom" && !customRangeReady(customFrom, customTo)) return;
    setRefreshing(true);
    void reloadOverview();
  };

  const tabs = useCallback(
    (id: CrmTab, label: string) => (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={tab === id}
        onClick={() => setTab(id)}
        className={`relative flex min-h-[52px] flex-1 justify-center px-4 text-sm font-semibold transition-colors hover:bg-tonki-chrome-hover/50 sm:text-base ${
          tab === id
            ? "text-tonki-chrome-text"
            : "text-tonki-chrome-text-muted hover:text-tonki-chrome-text-secondary"
        }`}
      >
        {label}
        {tab === id && (
          <span className="absolute bottom-0 left-0 right-0 mx-auto h-1 w-16 rounded-full bg-tonki-accent" />
        )}
      </button>
    ),
    [tab]
  );

  if (gatePending) {
    return (
      <div className="flex items-center justify-center px-4 py-16 text-sm text-tonki-text-muted">
        Cargando CRM de ventas…
      </div>
    );
  }

  if (!overview) {
    return (
      <main className="mx-auto w-full px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-tonki-text">CRM · Ventas</h1>
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
        >
          {loadError ?? "No se pudo cargar"}
        </p>
        {loadError?.includes("establecimiento") ? (
          <Link
            href="/account"
            className="mt-4 inline-flex rounded-xl bg-tonki-accent px-4 py-3 text-sm font-bold text-tonki-accent-fg"
          >
            Configurar negocio
          </Link>
        ) : null}
      </main>
    );
  }

  return (
    <>
      <div className="border-b border-tonki-chrome-border bg-tonki-chrome/95">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-lg font-bold text-tonki-chrome-text sm:text-xl">
              CRM · Ventas
            </h1>
            <p className="text-xs text-tonki-chrome-text-muted sm:text-sm">
              Ventas por monto o por producto (opcional)
            </p>
          </div>
          <Link
            href="/admin/dashboard"
            className="shrink-0 rounded-xl border border-tonki-chrome-border px-3 py-2 text-xs font-semibold text-tonki-chrome-text-secondary transition-colors hover:bg-tonki-chrome-hover sm:text-sm"
          >
            Contenido
          </Link>
        </div>
        <div
          role="tablist"
          className="mx-auto grid w-full grid-cols-3 border-t border-tonki-chrome-border"
        >
          {tabs("overview", "Resumen")}
          {tabs("products", "Productos")}
          {tabs("sales", "Ventas")}
        </div>
      </div>

      <main className="mx-auto w-full pb-4" role="tabpanel">
        {loadError ? (
          <p
            role="alert"
            className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
          >
            {loadError}
          </p>
        ) : null}
        {tab !== "products" ? (
          <div className="px-4 pt-4">
            <CrmAnalyticsFilters
              preset={preset}
              status={status}
              from={customFrom}
              to={customTo}
              rangeLabel={formatCrmRangeLabel(
                overview.filter.from,
                overview.filter.to
              )}
              refreshing={refreshing}
              exportHref={rangeReady ? crmExportPath(query) : null}
              exportFilename={exportFilename(query, overview.filter)}
              onPresetChange={choosePreset}
              onStatusChange={chooseStatus}
              onFromChange={changeFrom}
              onToChange={changeTo}
            />
          </div>
        ) : null}
        {tab === "overview" ? (
          <CrmOverviewTab
            overview={overview}
            products={products}
            onSaleRegistered={refreshAfterWrite}
          />
        ) : tab === "products" ? (
          <CrmProductsTab
            products={products}
            onProductsChange={(next) => {
              setProducts(next);
              refreshAfterWrite();
            }}
          />
        ) : (
          <CrmSalesTab
            sales={overview.recent_sales}
            salesCount={overview.summary.sales_count}
            salesTruncated={overview.sales_truncated}
            filter={overview.filter}
            cashbackPercent={overview.cashback_percent}
            products={products}
            onSaleRegistered={refreshAfterWrite}
          />
        )}
      </main>
    </>
  );
}
