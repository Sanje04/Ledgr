import { describe, expect, it } from "vitest";
import {
  getCategorySpendingLastNDays,
  getSpendTimeSeries,
  getSummaryStats,
  getTopMerchants,
  OTHER_CATEGORY,
} from "./spending";
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

describe("getSummaryStats", () => {
  const range = {
    start: new Date("2026-09-01T00:00:00Z"),
    end: new Date("2026-09-11T00:00:00Z"),
  };

  it("separates spend from income and averages over the range, not over active days", () => {
    const txns: Transaction[] = [
      txn({ amount: -100, date: "2026-09-02T00:00:00Z" }),
      txn({ amount: -50, date: "2026-09-03T00:00:00Z" }),
      txn({ category: "Income", amount: 2000, date: "2026-09-04T00:00:00Z" }),
      // The receiving leg of an internal transfer is not income.
      txn({ category: "Transfer", amount: 300, date: "2026-09-05T00:00:00Z" }),
      txn({ amount: -999, date: "2026-08-01T00:00:00Z" }), // outside the range
    ];

    const stats = getSummaryStats(txns, range);

    expect(stats.totalSpent).toBe(150);
    expect(stats.totalIncome).toBe(2000);
    expect(stats.net).toBe(1850);
    expect(stats.spendCount).toBe(2);
    // 150 over the range's 10 days -- not over the 2 days that had spending.
    expect(stats.avgDaily).toBe(15);
    expect(stats.largestTransaction?.amount).toBe(-100);
  });
});

describe("getSpendTimeSeries", () => {
  it("emits empty buckets so a quiet stretch reads as a gap, not as continuity", () => {
    const range = {
      start: new Date("2026-09-01T00:00:00"),
      end: new Date("2026-09-04T23:59:59"),
    };
    const txns: Transaction[] = [
      txn({ amount: -20, date: "2026-09-01T00:00:00" }),
      txn({ amount: -5, date: "2026-09-04T00:00:00" }),
    ];

    const series = getSpendTimeSeries(txns, "daily", range);

    expect(series).toHaveLength(4);
    expect(series.map((p) => p.spend)).toEqual([20, 0, 0, 5]);
  });
});

describe("getTopMerchants", () => {
  const txns: Transaction[] = [
    txn({ merchant: "Whole Foods", amount: -200 }),
    txn({ merchant: "Corner Cafe", amount: -10 }),
    txn({ merchant: "Corner Cafe", amount: -10 }),
    txn({ merchant: "Corner Cafe", amount: -10 }),
    txn({ merchant: "Payroll", category: "Income", amount: 3000 }),
  ];

  it("ranks by total spend, ignoring income", () => {
    const result = getTopMerchants(txns, "spend", 5);

    expect(result.map((m) => m.merchant)).toEqual(["Whole Foods", "Corner Cafe"]);
    expect(result[0].total).toBe(200);
  });

  it("ranks by visit count when sorting by frequency", () => {
    const result = getTopMerchants(txns, "frequency", 5);

    expect(result.map((m) => m.merchant)).toEqual(["Corner Cafe", "Whole Foods"]);
    expect(result[0].count).toBe(3);
  });
});
