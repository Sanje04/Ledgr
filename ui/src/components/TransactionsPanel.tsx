import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Account, AccountType, Transaction } from "../types";
import { fetchTransactions, importTransactionsCsv } from "../services/transactions";
import CategorySpendingChart from "./CategorySpendingChart";
import { colorForCategory } from "../utils/categoryColors";
import "../styles/TransactionsPanel.css";

type AccountFilter = "all" | AccountType;

const ACCOUNT_FILTERS: ReadonlyArray<{ value: AccountFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
];

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AccountIcon({ type }: { type: AccountType }): JSX.Element {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (type === "savings") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 17l6-6 4 4 7-7" />
        <path d="M14 8h7v7" />
      </svg>
    );
  }
  if (type === "credit_card") {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M3 10l9-6 9 6" />
      <path d="M4 10v9M8 10v9M16 10v9M20 10v9" />
      <path d="M2 21h20" />
    </svg>
  );
}

function TransactionsPanel(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredTransactions = useMemo(
    () =>
      accountFilter === "all"
        ? transactions
        : transactions.filter((txn) => txn.account_id === accountFilter),
    [transactions, accountFilter]
  );

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchTransactions();
        if (!cancelled) {
          setAccounts(data.accounts);
          setTransactions(data.transactions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Error: Unable to load transactions. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    if (!window.confirm("Importing will replace all existing transaction data. Continue?")) {
      return;
    }

    setIsImporting(true);
    setImportMessage(null);
    setError(null);
    try {
      const result = await importTransactionsCsv(file);
      setImportMessage(`Imported ${result.imported_count} transactions.`);
      const data = await fetchTransactions();
      setAccounts(data.accounts);
      setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error: Unable to import transactions. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <aside className="transactions-panel">
      <div className="transactions-panel__header">
        <h2 className="transactions-panel__label">Accounts</h2>
        <button
          type="button"
          className="transactions-panel__import-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
        >
          {isImporting ? "Importing..." : "Import CSV"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="transactions-panel__import-input"
          onChange={(event) => void handleFileSelected(event)}
        />
      </div>

      {isLoading && <p className="transactions-panel__status">Loading...</p>}

      {importMessage && <p className="transactions-panel__status transactions-panel__status--success">{importMessage}</p>}

      {error && (
        <div className="transactions-panel__error" role="alert">
          {error}
        </div>
      )}

      {!isLoading && !error && (
        <>
          <ul className="transactions-panel__accounts">
            {accounts.map((account) => (
              <li key={account.id} className="transactions-panel__account">
                <span className="transactions-panel__account-icon">
                  <AccountIcon type={account.type} />
                </span>
                <span className="transactions-panel__account-name">{account.name}</span>
                <span
                  className={
                    "transactions-panel__account-balance" +
                    (account.current_balance < 0
                      ? " transactions-panel__account-balance--negative"
                      : "")
                  }
                >
                  {formatCurrency(account.current_balance)}
                </span>
              </li>
            ))}
          </ul>

          <div className="transactions-panel__filter" role="group" aria-label="Filter by account">
            {ACCOUNT_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={
                  "transactions-panel__filter-button" +
                  (accountFilter === filter.value ? " transactions-panel__filter-button--active" : "")
                }
                aria-pressed={accountFilter === filter.value}
                onClick={() => setAccountFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <h2 className="transactions-panel__label transactions-panel__label--spaced">
            Spending by category
          </h2>
          <CategorySpendingChart transactions={filteredTransactions} />

          <h2 className="transactions-panel__label transactions-panel__label--spaced">
            Recent transactions
          </h2>
          <ul className="transactions-panel__transactions">
            {filteredTransactions.map((txn) => (
              <li key={txn.id} className="transactions-panel__transaction">
                <div className="transactions-panel__transaction-main">
                  <span className="transactions-panel__transaction-merchant">{txn.merchant}</span>
                  <span
                    className={
                      "transactions-panel__transaction-amount" +
                      (txn.amount < 0 ? " transactions-panel__transaction-amount--negative" : "")
                    }
                  >
                    {formatCurrency(txn.amount)}
                  </span>
                </div>
                <div className="transactions-panel__transaction-meta">
                  <span>{formatDate(txn.date)}</span>
                  <span className="transactions-panel__transaction-category">
                    <span
                      className="transactions-panel__transaction-category-dot"
                      style={{ backgroundColor: colorForCategory(txn.category) }}
                    />
                    {txn.category}
                  </span>
                  <span>{txn.account_name}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

export default TransactionsPanel;
