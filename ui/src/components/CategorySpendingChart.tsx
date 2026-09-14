import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Transaction } from "../types";
import { getCategorySpendingLastNDays } from "../utils/spending";
import { colorForCategory } from "../utils/categoryColors";
import "../styles/CategorySpendingChart.css";

const WINDOW_DAYS = 30;

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0];
  return (
    <div className="category-spending-chart__tooltip" role="tooltip">
      <span
        className="category-spending-chart__tooltip-key"
        style={{ backgroundColor: colorForCategory(entry.name) }}
      />
      <span className="category-spending-chart__tooltip-value">{formatCurrency(entry.value)}</span>
      <span className="category-spending-chart__tooltip-label">{entry.name}</span>
    </div>
  );
}

interface CategorySpendingChartProps {
  transactions: Transaction[];
}

function CategorySpendingChart({ transactions }: CategorySpendingChartProps): JSX.Element {
  const data = useMemo(
    () => getCategorySpendingLastNDays(transactions, WINDOW_DAYS),
    [transactions]
  );
  const total = useMemo(() => data.reduce((sum, entry) => sum + entry.total, 0), [data]);

  if (data.length === 0) {
    return (
      <p className="category-spending-chart__empty">No spending in the last {WINDOW_DAYS} days.</p>
    );
  }

  return (
    <div className="category-spending-chart">
      <div className="category-spending-chart__plot">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="category"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={colorForCategory(entry.category)}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="category-spending-chart__center">
          <span className="category-spending-chart__center-value">{formatCurrency(total)}</span>
          <span className="category-spending-chart__center-label">last {WINDOW_DAYS} days</span>
        </div>
      </div>

      <ul className="category-spending-chart__legend">
        {data.map((entry) => (
          <li key={entry.category} className="category-spending-chart__legend-item">
            <span
              className="category-spending-chart__legend-swatch"
              style={{ backgroundColor: colorForCategory(entry.category) }}
            />
            <span className="category-spending-chart__legend-label">{entry.category}</span>
            <span className="category-spending-chart__legend-value">{formatCurrency(entry.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CategorySpendingChart;
