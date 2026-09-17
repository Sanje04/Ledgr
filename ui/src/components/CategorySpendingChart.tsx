import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategorySpend } from "../utils/spending";
import { colorForCategory } from "../utils/categoryColors";
import { formatCurrency } from "../utils/format";
import "../styles/CategorySpendingChart.css";

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

export interface CategorySpendingChartProps {
  data: CategorySpend[];
  selectedCategory: string | null;
  /** Called with a category to select it, or null to clear the filter. */
  onSelectCategory: (category: string | null) => void;
  /** Describes the active window, e.g. "last 30 days". */
  rangeLabel: string;
}

/**
 * Category donut with a legend that doubles as the filter control.
 *
 * Data is passed in rather than computed here so the chart follows the
 * dashboard's range filter instead of a window of its own.
 *
 * Note the two separate click paths to the same setter: slices arrive through
 * recharts' own Pie onClick (with its payload shape), while legend rows are
 * ordinary buttons. The legend is also the accessible path -- these hues sit
 * close together in the brand's blue family, so category is always identified
 * by text, never by colour alone.
 */
function CategorySpendingChart({
  data,
  selectedCategory,
  onSelectCategory,
  rangeLabel,
}: CategorySpendingChartProps): JSX.Element {
  const total = useMemo(() => data.reduce((sum, entry) => sum + entry.total, 0), [data]);

  if (data.length === 0) {
    return <p className="category-spending-chart__empty">No spending in the {rangeLabel}.</p>;
  }

  const toggle = (category: string): void => {
    onSelectCategory(selectedCategory === category ? null : category);
  };

  return (
    <div className="category-spending-chart">
      <div className="category-spending-chart__plot">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="category"
              innerRadius={62}
              outerRadius={85}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              onClick={(entry: unknown) => {
                const category = (entry as { category?: string } | undefined)?.category;
                if (typeof category === "string") {
                  toggle(category);
                }
              }}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={colorForCategory(entry.category)}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  cursor="pointer"
                  opacity={
                    selectedCategory === null || selectedCategory === entry.category ? 1 : 0.32
                  }
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="category-spending-chart__center">
          <span className="category-spending-chart__center-value">{formatCurrency(total)}</span>
          <span className="category-spending-chart__center-label">{rangeLabel}</span>
        </div>
      </div>

      <ul className="category-spending-chart__legend">
        {data.map((entry) => {
          const isSelected = selectedCategory === entry.category;
          const isDimmed = selectedCategory !== null && !isSelected;
          return (
            <li key={entry.category}>
              <button
                type="button"
                className={`category-spending-chart__legend-item${
                  isSelected ? " category-spending-chart__legend-item--selected" : ""
                }${isDimmed ? " category-spending-chart__legend-item--dimmed" : ""}`}
                onClick={() => toggle(entry.category)}
                aria-pressed={isSelected}
              >
                <span
                  className="category-spending-chart__legend-swatch"
                  style={{ backgroundColor: colorForCategory(entry.category) }}
                />
                <span className="category-spending-chart__legend-label">{entry.category}</span>
                <span className="category-spending-chart__legend-value">
                  {formatCurrency(entry.total)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default CategorySpendingChart;
