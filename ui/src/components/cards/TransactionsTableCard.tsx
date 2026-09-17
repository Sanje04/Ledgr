import { useState } from "react";
import type { Transaction } from "../../types";
import { colorForCategory } from "../../utils/categoryColors";
import { formatShortDate, formatSignedCurrency } from "../../utils/format";

export interface TransactionsTableCardProps {
  transactions: Transaction[];
  /** True when the backend returned its 500-row ceiling -- see the note below. */
  isTruncated: boolean;
}

const PAGE_SIZE = 40;

/**
 * The transaction list.
 *
 * Amounts follow the design system's rule that expenses are ink, not red: only
 * income is coloured. The sign and the column carry the direction.
 */
function TransactionsTableCard({
  transactions,
  isTruncated,
}: TransactionsTableCardProps): JSX.Element {
  const [visible, setVisible] = useState(PAGE_SIZE);

  // The array arrives oldest-first (useTransactions sorts it that way for the
  // aggregates); a ledger reads newest-first.
  const rows = [...transactions].reverse();
  const shown = rows.slice(0, visible);

  return (
    <article className="card dashboard__table">
      <div className="card__head card__head--padded">
        <h2 className="card__title">Transactions</h2>
        <span className="card__meta tabular">
          {transactions.length} {transactions.length === 1 ? "row" : "rows"}
        </span>
      </div>

      {isTruncated && (
        <p className="dashboard__table-notice">
          Showing the 500 most recent transactions — the API's ceiling. Older rows aren't loaded,
          so totals and ranges above this cover only what's here.
        </p>
      )}

      <div className="txn-table">
        <div className="txn-table__row txn-table__row--head" role="row">
          <span>Date</span>
          <span>Merchant</span>
          <span>Category</span>
          <span>Account</span>
          <span className="txn-table__amount">Amount</span>
        </div>

        {shown.length === 0 ? (
          <p className="card__empty card__empty--padded">No transactions match these filters.</p>
        ) : (
          shown.map((txn) => (
            <div className="txn-table__row" role="row" key={txn.id}>
              <span className="txn-table__date tabular">{formatShortDate(txn.date)}</span>
              <span className="txn-table__merchant">
                <span className="txn-table__merchant-name">{txn.merchant}</span>
                <span className="txn-table__description">{txn.description}</span>
              </span>
              <span className="txn-table__category">
                <span
                  className="txn-table__dot"
                  style={{ backgroundColor: colorForCategory(txn.category) }}
                />
                {txn.category}
              </span>
              <span className="txn-table__account">{txn.account_name}</span>
              <span
                className="txn-table__amount tabular"
                style={{ color: txn.amount > 0 ? "var(--color-positive)" : "var(--color-text)" }}
              >
                {formatSignedCurrency(txn.amount, "always")}
              </span>
            </div>
          ))
        )}
      </div>

      {visible < rows.length && (
        <div className="dashboard__table-more">
          <button type="button" onClick={() => setVisible((current) => current + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - visible)} more
          </button>
        </div>
      )}
    </article>
  );
}

export default TransactionsTableCard;
