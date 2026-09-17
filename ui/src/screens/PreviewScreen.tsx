import { useState } from "react";
import type { PendingImport } from "../hooks/useCsvImport";
import type { AccountType } from "../types";
import type { CsvColumnRole } from "../types/dashboard";
import "../styles/PreviewScreen.css";

export interface PreviewScreenProps {
  pending: PendingImport;
  onConfirm: (
    accountName: string,
    accountType: AccountType,
    openingBalance: number
  ) => void;
  onCancel: () => void;
  isImporting: boolean;
  /** The backend's message verbatim, row number and all. */
  importError: string | null;
}

const ACCOUNT_TYPE_OPTIONS: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
];

const ROLE_LABELS: Record<Exclude<CsvColumnRole, "ignored">, string> = {
  type: "Type",
  date: "Date",
  amount: "Amount",
  description: "Description",
};

function PreviewScreen({
  pending,
  onConfirm,
  onCancel,
  isImporting,
  importError,
}: PreviewScreenProps): JSX.Element {
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [openingBalance, setOpeningBalance] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { preview } = pending;
  const mappedColumns = preview.columns.filter((column) => column.role !== "ignored");

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();

    const trimmedName = accountName.trim();
    if (!trimmedName) {
      setFormError("Account name is required.");
      return;
    }

    const balance = openingBalance.trim() === "" ? 0 : Number(openingBalance);
    if (Number.isNaN(balance)) {
      setFormError("Opening balance must be a number.");
      return;
    }

    setFormError(null);
    onConfirm(trimmedName, accountType, balance);
  };

  return (
    <section className="preview-screen">
      <p className="preview-screen__overline">Step 2 of 2 · Confirm</p>
      <h2 className="preview-screen__heading">
        {preview.headerFound
          ? `${preview.totalDataRows} rows read from ${preview.fileName}`
          : `Couldn't read the columns in ${preview.fileName}`}
      </h2>
      <p className="preview-screen__lede">
        {preview.headerFound
          ? "Here are the first rows exactly as they appear in the file. Your whole file is checked when you import — if anything is wrong, the import is rejected and nothing changes."
          : "The expected header row wasn't found, so there's nothing to preview. You can still import — the backend has the final say on whether the file is valid."}
      </p>

      {mappedColumns.length > 0 && (
        <div className="preview-screen__chips">
          {mappedColumns.map((column) => (
            <span key={column.index} className="preview-screen__chip">
              <span className="preview-screen__chip-field">
                {ROLE_LABELS[column.role as Exclude<CsvColumnRole, "ignored">]}
              </span>
              <span className="preview-screen__chip-arrow" aria-hidden="true">
                →
              </span>
              <span className="preview-screen__chip-column">{column.name}</span>
            </span>
          ))}
        </div>
      )}

      {preview.headerFound && preview.rows.length > 0 && (
        <div
          className="preview-screen__table"
          role="table"
          aria-label="First rows of the file"
          // The file decides how many columns there are, so the grid template
          // can't be static.
          style={{ "--preview-columns": preview.columns.length } as React.CSSProperties}
        >
          <div className="preview-screen__row preview-screen__row--head" role="row">
            {preview.columns.map((column) => (
              <span key={column.index} role="columnheader">
                {column.name}
              </span>
            ))}
          </div>
          {preview.rows.map((row, rowIndex) => (
            <div className="preview-screen__row" role="row" key={rowIndex}>
              {preview.columns.map((column) => (
                <span key={column.index} role="cell" title={row[column.index] ?? ""}>
                  {row[column.index] ?? ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      <form className="preview-screen__form" onSubmit={handleSubmit}>
        <p className="preview-screen__warning">
          Importing replaces all existing account and transaction data.
        </p>

        <div className="preview-screen__fields">
          <label className="preview-screen__field">
            <span>Account name</span>
            <input
              type="text"
              value={accountName}
              placeholder="e.g. My Card"
              disabled={isImporting}
              autoFocus
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>

          <label className="preview-screen__field">
            <span>Account type</span>
            <select
              value={accountType}
              disabled={isImporting}
              onChange={(event) => setAccountType(event.target.value as AccountType)}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="preview-screen__field">
            <span>Opening balance (optional)</span>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              placeholder="0.00"
              disabled={isImporting}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
          </label>
        </div>

        {formError !== null && (
          <p className="preview-screen__error" role="alert">
            {formError}
          </p>
        )}

        {importError !== null && (
          <p className="preview-screen__error" role="alert">
            {importError}
          </p>
        )}

        <div className="preview-screen__actions">
          <button type="submit" className="preview-screen__confirm" disabled={isImporting}>
            {isImporting ? "Importing…" : "Import transactions"}
          </button>
          <button
            type="button"
            className="preview-screen__cancel"
            onClick={onCancel}
            disabled={isImporting}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export default PreviewScreen;
