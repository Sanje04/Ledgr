import { useMemo, useState } from "react";
import type { Transaction } from "../../types";
import type { MerchantSort } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { getTopMerchants } from "../../utils/spending";
import SegmentedToggle from "./SegmentedToggle";

export interface TopMerchantsCardProps {
  /** Range-scoped rows WITHOUT the merchant filter applied -- see below. */
  transactions: Transaction[];
  selectedMerchant: string | null;
  onSelectMerchant: (merchant: string | null) => void;
}

const MERCHANT_LIMIT = 6;

/**
 * Merchants ranked by spend or by visit count.
 *
 * Deliberately fed rows that have NOT had the merchant filter applied: a card
 * that filters by its own dimension collapses to a single row on first click,
 * leaving no way to click back out.
 */
function TopMerchantsCard({
  transactions,
  selectedMerchant,
  onSelectMerchant,
}: TopMerchantsCardProps): JSX.Element {
  const [sort, setSort] = useState<MerchantSort>("spend");
  const merchants = useMemo(
    () => getTopMerchants(transactions, sort, MERCHANT_LIMIT),
    [transactions, sort]
  );

  const max = merchants.length > 0 ? (sort === "spend" ? merchants[0].total : merchants[0].count) : 0;

  return (
    <article className="card dashboard__merchants">
      <div className="card__head">
        <h2 className="card__title">Top merchants</h2>
        <SegmentedToggle
          value={sort}
          onChange={setSort}
          options={[
            { value: "spend", label: "Spend" },
            { value: "frequency", label: "Frequency" },
          ]}
        />
      </div>

      {merchants.length === 0 ? (
        <p className="card__empty">No spending in this range.</p>
      ) : (
        <ul className="merchant-list">
          {merchants.map((entry) => {
            const value = sort === "spend" ? entry.total : entry.count;
            const isSelected = selectedMerchant === entry.merchant;
            return (
              <li key={entry.merchant}>
                <button
                  type="button"
                  className={`merchant-list__row${isSelected ? " merchant-list__row--selected" : ""}`}
                  onClick={() => onSelectMerchant(isSelected ? null : entry.merchant)}
                  aria-pressed={isSelected}
                >
                  <span className="merchant-list__top">
                    <span className="merchant-list__name">{entry.merchant}</span>
                    <span className="merchant-list__value tabular">
                      {sort === "spend"
                        ? formatCurrency(entry.total)
                        : `${entry.count} ${entry.count === 1 ? "visit" : "visits"}`}
                    </span>
                  </span>
                  <span className="merchant-list__track">
                    <span
                      className="merchant-list__bar"
                      style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export default TopMerchantsCard;
