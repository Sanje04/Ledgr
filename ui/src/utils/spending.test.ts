import { describe, expect, it } from "vitest";
import { getCategorySpendingLastNDays, OTHER_CATEGORY } from "./spending";
import type { Transaction } from "../types";

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: "1",
    account_id: "checking",
    account_name: "Checking",
    account_type: "checking",
    date: "2026-09-01T00:00:00Z",
    amount: -10,
    merchant: "Test",
    description: "test",
    category: "Groceries",
    running_balance: 0,
    ...overrides,
  };
}

describe("getCategorySpendingLastNDays", () => {
  const now = new Date("2026-09-13T00:00:00Z");

  it("sums spending by category within the window, ignoring income and transfers", () => {
    const txns: Transaction[] = [
      txn({ category: "Groceries", amount: -50, date: "2026-09-10T00:00:00Z" }),
      txn({ category: "Groceries", amount: -20, date: "2026-09-05T00:00:00Z" }),
      txn({ category: "Dining", amount: -15, date: "2026-09-01T00:00:00Z" }),
      txn({ category: "Income", amount: 2800, date: "2026-09-01T00:00:00Z" }),
      txn({ category: "Transfer", amount: -300, date: "2026-09-01T00:00:00Z" }),
    ];

    const result = getCategorySpendingLastNDays(txns, 30, now);

    expect(result).toEqual([
      { category: "Groceries", total: 70 },
      { category: "Dining", total: 15 },
    ]);
  });

  it("excludes transactions older than the window", () => {
    const txns: Transaction[] = [txn({ category: "Groceries", amount: -50, date: "2026-06-01T00:00:00Z" })];

    expect(getCategorySpendingLastNDays(txns, 30, now)).toEqual([]);
  });

  it("folds unrecognized categories into Other", () => {
    const txns: Transaction[] = [txn({ category: "Mystery", amount: -25, date: "2026-09-01T00:00:00Z" })];

    expect(getCategorySpendingLastNDays(txns, 30, now)).toEqual([{ category: OTHER_CATEGORY, total: 25 }]);
  });

  it("keeps categories in a fixed order regardless of amount ranking", () => {
    const txns: Transaction[] = [
      txn({ category: "Rent", amount: -1000, date: "2026-09-01T00:00:00Z" }),
      txn({ category: "Groceries", amount: -10, date: "2026-09-01T00:00:00Z" }),
    ];

    const result = getCategorySpendingLastNDays(txns, 30, now);

    expect(result.map((r) => r.category)).toEqual(["Groceries", "Rent"]);
  });

  it("omits categories with no spend in the window", () => {
    const txns: Transaction[] = [txn({ category: "Dining", amount: -10, date: "2026-09-01T00:00:00Z" })];

    const result = getCategorySpendingLastNDays(txns, 30, now);

    expect(result).toEqual([{ category: "Dining", total: 10 }]);
  });
});
