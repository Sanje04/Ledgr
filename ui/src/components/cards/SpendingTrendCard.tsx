import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Transaction } from "../../types";
import type { ChartMode, DateRange, Granularity } from "../../types/dashboard";
import { clampGranularity } from "../../utils/dateRange";
import { formatCompactCurrency, formatCurrency } from "../../utils/format";
import { getSpendTimeSeries } from "../../utils/spending";
import SegmentedToggle from "./SegmentedToggle";

export interface SpendingTrendCardProps {
  transactions: Transaction[];
  range: DateRange;
}

interface TrendTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
}

function TrendTooltip({ active, label, payload }: TrendTooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  return (
    <div className="chart-tooltip" role="tooltip">
      <span className="chart-tooltip__label">{label}</span>
      {payload.map((entry) => (
        <span key={entry.dataKey} className="chart-tooltip__value tabular">
          {formatCurrency(entry.value)} {entry.dataKey === "spend" ? "out" : "in"}
        </span>
      ))}
    </div>
  );
}

/**
 * Spending over time.
 *
 * Mode and granularity are this card's own state -- nothing outside it cares.
 * The granularity actually drawn is derived at render from the preference and
 * the active range rather than synced into state, so widening the range
 * restores the user's choice instead of silently overwriting it.
 */
function SpendingTrendCard({ transactions, range }: SpendingTrendCardProps): JSX.Element {
  const [mode, setMode] = useState<ChartMode>("spend");
  const [granularityPreference, setGranularityPreference] = useState<Granularity>("weekly");

  const granularity = clampGranularity(granularityPreference, range);
  const data = useMemo(
    () => getSpendTimeSeries(transactions, granularity, range),
    [transactions, granularity, range]
  );

  return (
    <article className="card dashboard__trend">
      <div className="card__head">
        <h2 className="card__title">
          {mode === "spend" ? "Spending over time" : "Money in vs. out"}
        </h2>
        <div className="card__controls">
          <SegmentedToggle
            value={mode}
            onChange={setMode}
            options={[
              { value: "spend", label: "Spending" },
              { value: "inOut", label: "In vs. out" },
            ]}
          />
          <SegmentedToggle
            value={granularity}
            onChange={setGranularityPreference}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </div>

      <div className="dashboard__trend-plot">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={formatCompactCurrency}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "var(--color-accent-wash)" }} />
            {mode === "spend" ? (
              <Area
                type="monotone"
                dataKey="spend"
                stroke="var(--color-accent)"
                strokeWidth={2}
                fill="var(--color-accent-wash)"
                isAnimationActive={false}
              />
            ) : (
              <>
                <Bar dataKey="spend" fill="var(--color-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="income" fill="var(--color-positive)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default SpendingTrendCard;
