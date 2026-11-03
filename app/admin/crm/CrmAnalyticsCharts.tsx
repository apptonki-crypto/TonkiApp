"use client";

import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMxn } from "src/lib/crm/formatMxn";
import { peakRevenueHour, peakSaleHours } from "src/lib/crm/hourPeaks";
import { CRM_WEEKDAY_FULL, formatCrmDateLabel } from "src/lib/crm/mexicoCity";
import {
  CRM_UNASSIGNED_PRODUCT_ID,
  type CrmDayHourSeries,
  type CrmHourPoint,
  type CrmSeries,
} from "src/lib/crm/types";

const ACCENT = "#f4c542";
const ACCENT_STROKE = "#e3b535";
const INK = "#2d210d";
const MUTED = "#6b5530";
const GRID = "#e8dcb8";
const PRODUCT_CHART_LIMIT = 12;

type ChartRow = {
  label: string;
  sales_count: number;
  revenue: number;
  detail?: string;
  units_sold?: number;
  is_peak?: boolean;
};

function formatCount(value: number): string {
  return value.toLocaleString("es-MX");
}

function formatAxisMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function truncateName(name: string): string {
  if (name.length <= 18) return name;
  return `${name.slice(0, 17)}…`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-xl border border-tonki-border bg-tonki-surface px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold text-tonki-text">{row.detail ?? row.label}</p>
      <p className="text-tonki-text-secondary">Ingresos: {formatMxn(row.revenue)}</p>
      {row.units_sold != null ? (
        <p className="text-tonki-text-secondary">
          Unidades: {formatCount(row.units_sold)}
        </p>
      ) : (
        <p className="text-tonki-text-secondary">
          Ventas: {formatCount(row.sales_count)}
        </p>
      )}
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-tonki-border bg-tonki-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-tonki-text-secondary">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-tonki-text-faint">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const axisTick = { fill: MUTED, fontSize: 12 };

function salesWord(count: number): string {
  return count === 1 ? "1 venta" : `${formatCount(count)} ventas`;
}

function joinHourLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ? `las ${labels[0]}` : "";
  if (labels.length === 2) return `las ${labels[0]} y las ${labels[1]}`;
  return `las ${labels.slice(0, -1).join(", ")} y las ${labels[labels.length - 1]}`;
}

function peakSentence(hours: readonly CrmHourPoint[]): string {
  const peaks = peakSaleHours(hours);
  if (peaks.length === 0) return "Sin ventas este día.";

  const revenuePeak = peakRevenueHour(hours);
  const venta = salesWord(peaks[0].sales_count);
  if (peaks.length === 1) {
    const peak = peaks[0];
    if (revenuePeak && revenuePeak.hour !== peak.hour) {
      return `Se vende más a las ${peak.label} (${venta}). El mayor ingreso fue a las ${revenuePeak.label} (${formatMxn(revenuePeak.revenue)}).`;
    }
    return `Pico de ventas a las ${peak.label}: ${venta} y ${formatMxn(peak.revenue)}.`;
  }

  const when = joinHourLabels(peaks.map((peak) => peak.label));
  const base = `Se vende más a ${when}: ${venta} en cada hora.`;
  const sameRevenue = peaks.every((peak) => peak.revenue === peaks[0].revenue);
  if (sameRevenue) {
    return `${base} Cada una sumó ${formatMxn(peaks[0].revenue)}.`;
  }
  if (revenuePeak) {
    return `${base} El mayor ingreso fue a las ${revenuePeak.label} (${formatMxn(revenuePeak.revenue)}).`;
  }
  return base;
}

function dayPeakSummary(hours: readonly CrmHourPoint[]): string {
  const peaks = peakSaleHours(hours);
  if (peaks.length === 0) return "Sin ventas";
  const venta = salesWord(peaks[0].sales_count);
  if (peaks.length === 1) {
    return `${peaks[0].label} · ${venta} · ${formatMxn(peaks[0].revenue)}`;
  }
  return `${peaks.map((peak) => peak.label).join(", ")} · ${venta} cada una`;
}

function dayOptionLabel(day: CrmDayHourSeries): string {
  const weekday = CRM_WEEKDAY_FULL[day.weekday] ?? "";
  return `${weekday} ${formatCrmDateLabel(day.date)}`;
}

function defaultDayDate(days: readonly CrmDayHourSeries[]): string | null {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (day.hours.some((hour) => hour.sales_count > 0)) return day.date;
  }
  return days[days.length - 1]?.date ?? null;
}

export function CrmAnalyticsCharts({ series }: { series: CrmSeries }) {
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const days: ChartRow[] = series.by_day.map((point) => ({
    label: point.label,
    detail: formatCrmDateLabel(point.date),
    sales_count: point.sales_count,
    revenue: Number(point.revenue),
  }));
  const selectedDay =
    series.hours_by_day.find((day) => day.date === pickedDate) ??
    series.hours_by_day.find((day) => day.date === defaultDayDate(series.hours_by_day));
  const selectedPeaks = selectedDay ? peakSaleHours(selectedDay.hours) : [];
  const hours: ChartRow[] = (selectedDay?.hours ?? []).map((point) => {
    const nextHour = (point.hour + 1) % 24;
    const nextLabel = `${String(nextHour).padStart(2, "0")}:00`;
    const isPeak = selectedPeaks.some((peak) => peak.hour === point.hour);
    return {
      label: String(point.hour),
      detail: isPeak
        ? `${point.label}–${nextLabel} · pico de ventas`
        : `${point.label}–${nextLabel}`,
      sales_count: point.sales_count,
      revenue: Number(point.revenue),
      is_peak: isPeak,
    };
  });
  const weekdays: ChartRow[] = series.by_weekday.map((point) => ({
    label: point.label,
    detail: CRM_WEEKDAY_FULL[point.weekday],
    sales_count: point.sales_count,
    revenue: Number(point.revenue),
  }));
  const topProducts = series.by_product.slice(0, PRODUCT_CHART_LIMIT);
  const hiddenProducts = series.by_product.length - topProducts.length;
  const products: ChartRow[] = topProducts.map((point) => ({
    label: point.product_name,
    sales_count: 0,
    revenue: Number(point.revenue),
    units_sold: point.units_sold,
  }));
  const includesUnassigned = series.by_product.some(
    (point) => point.product_id === CRM_UNASSIGNED_PRODUCT_ID
  );
  const daysWithSales = series.hours_by_day.filter((day) =>
    day.hours.some((hour) => hour.sales_count > 0)
  );
  const quietDays = series.hours_by_day.length - daysWithSales.length;

  return (
    <div className="space-y-4">
      <ChartCard title="Ingresos por día" hint="Pesos mexicanos">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickMargin={8} minTickGap={24} />
              <YAxis
                tick={axisTick}
                tickFormatter={formatAxisMoney}
                width={72}
                domain={[0, "auto"]}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Ingresos"
                stroke={ACCENT_STROKE}
                fill={ACCENT}
                fillOpacity={0.55}
                strokeWidth={2}
                dot={
                  days.length <= 2
                    ? { r: 4, fill: ACCENT, stroke: INK, strokeWidth: 1 }
                    : false
                }
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Ventas por hora del día"
        hint={
          selectedPeaks.length > 1
            ? "Hora de Ciudad de México. Las barras oscuras son las horas con más ventas."
            : selectedPeaks.length === 1
              ? "Hora de Ciudad de México. La barra oscura es la hora con más ventas."
              : "Hora de Ciudad de México."
        }
      >
        {series.hours_by_day.length > 1 ? (
          <label className="block text-xs font-medium text-tonki-text-muted">
            Día
            <select
              value={selectedDay?.date ?? ""}
              onChange={(event) => setPickedDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-tonki-border bg-tonki-canvas px-3 py-2 text-sm text-tonki-text outline-none focus:border-tonki-accent"
            >
              {series.hours_by_day.map((day) => (
                <option key={day.date} value={day.date}>
                  {dayOptionLabel(day)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="mt-3 text-sm font-semibold text-tonki-text">
          {daysWithSales.length === 0
            ? "Sin ventas en este periodo."
            : selectedDay
              ? peakSentence(selectedDay.hours)
              : "Sin ventas en este periodo."}
        </p>
        <div className="mt-3 overflow-x-auto">
          <div className="h-64 min-w-[36rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} interval={1} tickMargin={8} />
                <YAxis
                  tick={axisTick}
                  allowDecimals={false}
                  width={36}
                  domain={[0, "auto"]}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(244, 197, 66, 0.18)" }} />
                <Bar
                  dataKey="sales_count"
                  name="Ventas"
                  fill={ACCENT}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={18}
                >
                  {hours.map((row) => (
                    <Cell
                      key={row.detail ?? row.label}
                      fill={row.is_peak ? INK : ACCENT}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {daysWithSales.length > 1 ? (
          <div className="mt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-tonki-text-muted">
              Pico de cada día
            </h3>
            <ul className="mt-2 max-h-80 divide-y divide-tonki-border overflow-y-auto rounded-xl border border-tonki-border">
              {daysWithSales.map((day) => {
                const selected = day.date === selectedDay?.date;
                return (
                  <li key={day.date}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPickedDate(day.date)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                        selected
                          ? "bg-tonki-accent/25 font-semibold text-tonki-text"
                          : "text-tonki-text-secondary hover:bg-tonki-canvas"
                      }`}
                    >
                      <span className="capitalize">{dayOptionLabel(day)}</span>
                      <span className="shrink-0 tabular-nums">{dayPeakSummary(day.hours)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {quietDays > 0 ? (
              <p className="mt-2 text-xs text-tonki-text-faint">
                {quietDays.toLocaleString("es-MX")}{" "}
                {quietDays === 1 ? "día" : "días"} del periodo sin ventas.
              </p>
            ) : null}
          </div>
        ) : null}
      </ChartCard>

      <ChartCard title="Ventas por día de la semana">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} interval={0} tickMargin={8} />
              <YAxis
                tick={axisTick}
                allowDecimals={false}
                width={36}
                domain={[0, "auto"]}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(244, 197, 66, 0.18)" }} />
              <Bar
                dataKey="sales_count"
                name="Ventas"
                fill={ACCENT}
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Productos con más ingresos">
        {products.length === 0 ? (
          <p className="py-6 text-sm text-tonki-text-muted">
            Sin ventas en este periodo.
          </p>
        ) : (
          <>
            <div className="w-full" style={{ height: Math.max(180, products.length * 36 + 24) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={products}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={axisTick}
                    tickFormatter={formatAxisMoney}
                    domain={[0, "auto"]}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    reversed
                    tick={axisTick}
                    width={128}
                    interval={0}
                    tickFormatter={truncateName}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(244, 197, 66, 0.18)" }} />
                  <Bar
                    dataKey="revenue"
                    name="Ingresos"
                    fill={ACCENT}
                    radius={[0, 6, 6, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {hiddenProducts > 0 ? (
              <p className="mt-2 text-xs text-tonki-text-faint">
                Mostrando los {PRODUCT_CHART_LIMIT} productos con más ingresos, de{" "}
                {series.by_product.length.toLocaleString("es-MX")}.
              </p>
            ) : null}
            {includesUnassigned ? (
              <p className="mt-2 text-xs text-tonki-text-faint">
                Las ventas solo por monto se agrupan en Sin producto para que el
                total no se pierda.
              </p>
            ) : null}
          </>
        )}
      </ChartCard>
    </div>
  );
}
