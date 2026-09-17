import { USE_MOCK_DATA, missingBackendError } from "../constants";
import type { AccountType, ImportResult, TransactionsResponse } from "../types";

// Set alongside VITE_API_URL. Unset is an error, not a cue to mock -- see
// USE_MOCK_DATA in ../constants.
const TRANSACTIONS_API_URL = import.meta.env.VITE_TRANSACTIONS_API_URL as string | undefined;
// Derived, not a third env var -- CLAUDE.md already flags the VITE_API_URL/
// VITE_TRANSACTIONS_API_URL pair as one config duplication too many.
const IMPORT_API_URL = TRANSACTIONS_API_URL ? `${TRANSACTIONS_API_URL}/import` : undefined;

const MOCK_TRANSACTIONS_RESPONSE: TransactionsResponse = {
  accounts: [
    { id: "checking", name: "Checking", type: "checking", current_balance: 2140.55 },
    { id: "savings", name: "Savings", type: "savings", current_balance: 15320.0 },
    { id: "credit_card", name: "Credit Card", type: "credit_card", current_balance: -412.3 },
  ],
  transactions: [
    {
      id: "mock-1",
      account_id: "checking",
      account_name: "Checking",
      account_type: "checking",
      date: new Date().toISOString(),
      amount: -84.32,
      merchant: "Whole Foods",
      description: "Weekly grocery run",
      category: "Groceries",
      running_balance: 2140.55,
    },
    {
      id: "mock-2",
      account_id: "credit_card",
      account_name: "Credit Card",
      account_type: "credit_card",
      date: new Date(Date.now() - 86_400_000).toISOString(),
      amount: -42.1,
      merchant: "Chipotle",
      description: "Lunch",
      category: "Dining",
      running_balance: -412.3,
    },
    {
      id: "mock-3",
      account_id: "checking",
      account_name: "Checking",
      account_type: "checking",
      date: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      amount: 2800.0,
      merchant: "Employer Payroll",
      description: "Paycheck deposit",
      category: "Income",
      running_balance: 2224.87,
    },
  ],
};

function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTransactionsFromMock(): Promise<TransactionsResponse> {
  await mockDelay(400 + Math.random() * 400);
  return MOCK_TRANSACTIONS_RESPONSE;
}

function isTransactionsResponse(data: unknown): data is TransactionsResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as TransactionsResponse).accounts) &&
    Array.isArray((data as TransactionsResponse).transactions)
  );
}

async function fetchTransactionsFromRealApi(): Promise<TransactionsResponse> {
  let response: Response;
  try {
    response = await fetch(TRANSACTIONS_API_URL as string);
  } catch {
    throw new Error("Error: Unable to load transactions. Please try again.");
  }

  if (!response.ok) {
    throw new Error("Error: Unable to load transactions. Please try again.");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Error: Unable to load transactions. Please try again.");
  }

  if (!isTransactionsResponse(data)) {
    throw new Error("Error: Unable to load transactions. Please try again.");
  }

  return data;
}

export async function fetchTransactions(): Promise<TransactionsResponse> {
  if (USE_MOCK_DATA) {
    return fetchTransactionsFromMock();
  }
  if (!TRANSACTIONS_API_URL) {
    throw missingBackendError("VITE_TRANSACTIONS_API_URL");
  }
  return fetchTransactionsFromRealApi();
}

// Unlike fetchTransactions' fully-collapsed error message, this surfaces the
// backend's specific validation error (e.g. "Row 12: invalid date...") since
// it's actionable -- the user can fix their CSV -- where a read failure isn't.
export async function importTransactionsCsv(
  file: File,
  accountName: string,
  accountType: AccountType,
  openingBalance: number
): Promise<ImportResult> {
  if (!IMPORT_API_URL) {
    throw new Error(
      "Error: Import isn't available in mock mode. Unset VITE_USE_MOCK_DATA and " +
        "configure VITE_TRANSACTIONS_API_URL to import real data."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("account_name", accountName);
  formData.append("account_type", accountType);
  formData.append("opening_balance", String(openingBalance));

  let response: Response;
  try {
    response = await fetch(IMPORT_API_URL, { method: "POST", body: formData });
  } catch {
    throw new Error("Error: Unable to import transactions. Please try again.");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Error: Unable to import transactions. Please try again.");
  }

  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || "Error: Unable to import transactions. Please try again.");
  }

  return data as ImportResult;
}
