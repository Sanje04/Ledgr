import { describe, expect, it } from "vitest";
import { detectAnomalies, detectRecurring } from "./patterns";
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

/** A charge repeating every `gapDays`, oldest first. */
function repeating(
  merchant: string,
  amount: number,
  gapDays: number,
  count: number,
  category = "Entertainment"
): Transaction[] {
  const rows: Transaction[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date("2026-01-05T00:00:00Z");
    date.setDate(date.getDate() + i * gapDays);
    rows.push(
      txn({ id: `${merchant}-${i}`, merchant, amount, category, date: date.toISOString() })
    );
  }
  return rows;
}

describe("detectRecurring", () => {
  it("finds a monthly subscription and normalizes it to a monthly cost", () => {
    const result = detectRecurring(repeating("Netflix", -15.99, 30, 6));

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Netflix");
    expect(result[0].cadence).toBe("monthly");
    expect(result[0].occurrences).toBe(6);
    expect(result[0].averageAmount).toBe(15.99);
    expect(result[0].isIncome).toBe(false);
  });

  it("ignores merchants with too few occurrences or erratic amounts", () => {
    const tooFew = repeating("Spotify", -11, 30, 2);
    // Same cadence, but the amount swings far too widely to be a subscription.
    const erratic = [
      ...repeating("Corner Store", -10, 30, 1),
      ...repeating("Corner Store", -300, 30, 1).map((t) => ({ ...t, id: "x", date: "2026-02-04T00:00:00Z" })),
      txn({ id: "y", merchant: "Corner Store", amount: -8, date: "2026-03-06T00:00:00Z" }),
    ];

    expect(detectRecurring([...tooFew, ...erratic])).toEqual([]);
  });

  it("ranks a weekly charge above a larger monthly one by monthly cost", () => {
    const result = detectRecurring([
      ...repeating("Weekly Coffee", -20, 7, 8, "Dining"),
      ...repeating("Monthly Gym", -50, 30, 5, "Healthcare"),
    ]);

    expect(result.map((r) => r.merchant)).toEqual(["Weekly Coffee", "Monthly Gym"]);
  });
});

describe("detectAnomalies", () => {
  it("flags a transaction far above its category's median", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        txn({ id: `g${i}`, amount: -50, category: "Groceries" })
      ),
      txn({ id: "spike", amount: -600, category: "Groceries", merchant: "Whole Foods" }),
    ];

    const result = detectAnomalies(rows);

    expect(result).toHaveLength(1);
    expect(result[0].transaction.id).toBe("spike");
    expect(result[0].baselineLabel).toBe("Groceries");
    expect(result[0].baselineMedian).toBe(50);
    expect(result[0].multiple).toBe(12);
  });

  it("falls back to a global baseline when a category is too thin to judge", () => {
    // Exactly the shape of imported data: almost everything lands in "Other",
    // with one tiny category that can't supply its own baseline.
    const rows = [
      ...Array.from({ length: 8 }, (_, i) =>
        txn({ id: `o${i}`, amount: -40, category: "Other" })
      ),
      txn({ id: "thin", amount: -500, category: "Healthcare" }),
    ];

    const result = detectAnomalies(rows);

    expect(result.map((r) => r.transaction.id)).toEqual(["thin"]);
    expect(result[0].baselineLabel).toBe("all spending");
  });

  it("ignores income and transfers entirely", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => txn({ id: `s${i}`, amount: -30 })),
      txn({ id: "pay", amount: 5000, category: "Income" }),
      txn({ id: "move", amount: -4000, category: "Transfer" }),
    ];

    expect(detectAnomalies(rows)).toEqual([]);
  });
});
