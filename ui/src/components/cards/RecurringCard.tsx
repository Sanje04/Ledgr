import type { RecurringSeries } from "../../types/dashboard";
import { colorForCategory } from "../../utils/categoryColors";
import { formatCurrency, formatShortDate } from "../../utils/format";

export interface RecurringCardProps {
  series: RecurringSeries[];
  onSelectMerchant: (merchant: string) => void;
}

const CADENCE_LABELS: Record<RecurringSeries["cadence"], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

/**
 * Subscriptions, rent, payroll.
 *
 * Fed the FULL history rather than the range-scoped rows: a 30-day window
 * yields two or three samples per merchant, which can't distinguish a cadence
 * from a coincidence. The list therefore doesn't change with the range pills,
 * which the subtitle says out loud so it doesn't read as a bug.
 */
function RecurringCard({ series, onSelectMerchant }: RecurringCardProps): JSX.Element {
  const monthlyTotal = series
    .filter((entry) => !entry.isIncome)
    .reduce((sum, entry) => sum + entry.monthlyAmount, 0);

  return (
    <article className="card dashboard__recurring">
      <div className="card__head">
        <h2 className="card__title">Recurring</h2>
        <span className="card__meta tabular">
          {series.length > 0 ? `${formatCurrency(monthlyTotal)} a month` : "across all history"}
        </span>
      </div>

      {series.length === 0 ? (
        <p className="card__empty">Not enough history yet to spot a repeating pattern.</p>
      ) : (
        <ul className="recurring-list">
          {series.slice(0, 6).map((entry) => (
            <li key={entry.merchant}>
              <button
                type="button"
                className="recurring-list__row"
                onClick={() => onSelectMerchant(entry.merchant)}
              >
                <span
                  className="recurring-list__dot"
                  style={{ backgroundColor: colorForCategory(entry.category) }}
                />
                <span className="recurring-list__body">
                  <span className="recurring-list__name">{entry.merchant}</span>
                  <span className="recurring-list__sub">
                    {CADENCE_LABELS[entry.cadence]} · {entry.category} · next{" "}
                    {formatShortDate(entry.nextExpectedDate)}
                  </span>
                </span>
                <span
                  className="recurring-list__amount tabular"
                  style={{ color: entry.isIncome ? "var(--color-positive)" : "var(--color-text)" }}
                >
                  {formatCurrency(entry.averageAmount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default RecurringCard;
