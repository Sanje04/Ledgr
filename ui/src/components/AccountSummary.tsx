import type { Account, AccountType } from "../types";
import { formatCurrency } from "../utils/format";

export interface AccountSummaryProps {
  accounts: Account[];
}

/**
 * The account and its balance.
 *
 * Deliberately NOT a filter. An import creates exactly one account (specs.md
 * Phase 5), so the old All/Checking/Savings filter bar was removed as a
 * single-item no-op; this restates that as a display element rather than
 * quietly reintroducing the control.
 */
function AccountSummary({ accounts }: AccountSummaryProps): JSX.Element | null {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="account-summary">
      {accounts.map((account) => (
        <span className="account-summary__item" key={account.id}>
          <span className="account-summary__icon" aria-hidden="true">
            <AccountIcon type={account.type} />
          </span>
          <span className="account-summary__name">{account.name}</span>
          <span
            className="account-summary__balance tabular"
            style={{
              color: account.current_balance < 0 ? "var(--color-negative)" : "var(--color-text)",
            }}
          >
            {formatCurrency(account.current_balance)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function AccountIcon({ type }: { type: AccountType }): JSX.Element {
  if (type === "savings") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m22 7-8.5 8.5-5-5L2 17" />
        <path d="M16 7h6v6" />
      </svg>
    );
  }

  if (type === "credit_card") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 10v11M10 10v11M14 10v11M18 10v11" />
    </svg>
  );
}

export default AccountSummary;
