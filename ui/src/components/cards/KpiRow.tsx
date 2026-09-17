import { formatCurrency, formatShortDate, formatSignedCurrency } from "../../utils/format";
import type { SummaryStats } from "../../types/dashboard";

export interface KpiRowProps {
  /** Stats over the range with the category/merchant filters applied. */
  filtered: SummaryStats;
  /** Stats over the same range with no category/merchant filter. */
  unfiltered: SummaryStats;
  activeCategory: string | null;
  activeMerchant: string | null;
}

/**
 * The five headline numbers.
 *
 * Income and net are read from the UNFILTERED stats whenever ANY filter is on.
 * Both filters distort them the same way: "Income" is itself a category, so
 * filtering to Dining reports $0 income; and a merchant filter leaves only what
 * that one merchant paid you, which is almost always $0 too. Either way the net
 * collapses to minus the filtered spend -- true of the slice, but read as a
 * statement about the user's finances. The labels say which basis is in play.
 */
function KpiRow({
  filtered,
  unfiltered,
  activeCategory,
  activeMerchant,
}: KpiRowProps): JSX.Element {
  const isFiltered = activeCategory !== null || activeMerchant !== null;
  const spendLabel =
    activeCategory !== null
      ? `${activeCategory} spend`
      : activeMerchant !== null
        ? `Spent at ${activeMerchant}`
        : "Total spent";
  const income = isFiltered ? unfiltered.totalIncome : filtered.totalIncome;
  const net = isFiltered ? unfiltered.net : filtered.net;
  const largest = filtered.largestTransaction;

  return (
    <div className="dashboard__kpis">
      <article className="card kpi">
        <p className="kpi__label kpi__sub--truncate">{spendLabel}</p>
        <p className="kpi__value tabular">{formatCurrency(filtered.totalSpent)}</p>
        <p className="kpi__sub">
          {filtered.spendCount} {filtered.spendCount === 1 ? "purchase" : "purchases"}
        </p>
      </article>

      <article className="card kpi">
        <p className="kpi__label">Total income</p>
        <p className="kpi__value tabular">{formatCurrency(income)}</p>
        <p className="kpi__sub">
          {income === 0 ? "none in range" : isFiltered ? "across all categories" : "deposits and interest"}
        </p>
      </article>

      <article className="card kpi">
        <p className="kpi__label">Net cash flow</p>
        <p
          className="kpi__value tabular"
          style={{ color: net >= 0 ? "var(--color-positive)" : "var(--color-text)" }}
        >
          {formatSignedCurrency(net, "always")}
        </p>
        <p className="kpi__sub">{isFiltered ? "across all categories" : "income minus spending"}</p>
      </article>

      <article className="card kpi">
        <p className="kpi__label">Average daily spend</p>
        <p className="kpi__value tabular">{formatCurrency(filtered.avgDaily)}</p>
        <p className="kpi__sub">{formatCurrency(filtered.avgWeekly)} a week</p>
      </article>

      <article className="card kpi">
        <p className="kpi__label">Largest transaction</p>
        <p className="kpi__value tabular">
          {largest ? formatCurrency(Math.abs(largest.amount)) : "—"}
        </p>
        <p className="kpi__sub kpi__sub--truncate">
          {largest ? `${largest.merchant} · ${formatShortDate(largest.date)}` : "nothing in range"}
        </p>
      </article>
    </div>
  );
}

export default KpiRow;
