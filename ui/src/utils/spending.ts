import type { Transaction } from "../types";
import type {
  DateRange,
  Granularity,
  MerchantSort,
  MerchantTotal,
  SummaryStats,
  TimeSeriesPoint,
} from "../types/dashboard";
import { daysInRange, parseTransactionDate, toIsoDate } from "./dateRange";

// Fixed rendering/color order for the real spending categories -- deliberately
// NOT sorted by amount. Per the dataviz skill's non-negotiable rule ("color
// follows the entity, never its rank"), the same category must always occupy
// the same visual position so that changing the time window or importing a
// new dataset never repaints a category that's still present. Must match the keys of
// CATEGORY_COLOR_VARS in categoryColors.ts.
export const CATEGORY_ORDER = [
  "Groceries",
  "Dining",
  "Transport",
  "Entertainment",
  "Shopping",
  "Utilities",
  "Healthcare",
  "Rent",
] as const;

export const OTHER_CATEGORY = "Other";

// Moving money between the user's own accounts, or receiving it, isn't
// "spending" -- mirrors backend/db.py's get_spending_summary() exclusion so
// the two stay consistent.
//
// Exported because every aggregate in this file and in patterns.ts needs the
// same exclusion, and re-declaring the Set per module is exactly the "shared
// constant kept in sync by comment" problem CLAUDE.md warns about. It matters
// more than it looks: the seed data records internal transfers on BOTH legs,
// so anything that forgets the exclusion double-counts them.
export const NON_SPENDING_CATEGORIES: ReadonlySet<string> = new Set(["Transfer", "Income"]);

/** An outflow that counts as real spending (not a transfer between accounts). */
export function isSpending(txn: Transaction): boolean {
  return txn.amount < 0 && !NON_SPENDING_CATEGORIES.has(txn.category);
}

/** Money genuinely coming in -- not the receiving leg of an internal transfer. */
export function isIncome(txn: Transaction): boolean {
  return txn.amount > 0 && txn.category !== "Transfer";
}

export interface CategorySpend {
  category: string;
  total: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Total spend per category between `start` and `end` (both inclusive).
 * Categories outside CATEGORY_ORDER are folded into "Other". Returned in the
 * fixed CATEGORY_ORDER (then "Other" last) with zero-spend categories omitted
 * -- never sorted by amount.
 */
export function getCategorySpendingInRange(
  transactions: Transaction[],
  start: Date,
  end: Date
): CategorySpend[] {
  const totals = new Map<string, number>();

  for (const txn of transactions) {
    if (!isSpending(txn)) {
      continue;
    }
    const txnDate = parseTransactionDate(txn.date);
    if (txnDate < start || txnDate > end) {
      continue;
    }
    const bucket = (CATEGORY_ORDER as readonly string[]).includes(txn.category)
      ? txn.category
      : OTHER_CATEGORY;
    totals.set(bucket, (totals.get(bucket) ?? 0) + Math.abs(txn.amount));
  }

  const ordered: CategorySpend[] = [];
  for (const category of CATEGORY_ORDER) {
    const total = totals.get(category);
    if (total) {
      ordered.push({ category, total: round2(total) });
    }
  }
  const otherTotal = totals.get(OTHER_CATEGORY);
  if (otherTotal) {
    ordered.push({ category: OTHER_CATEGORY, total: round2(otherTotal) });
  }

  return ordered;
}

/**
 * Total spend per category over the trailing `days` window ending at
 * `referenceDate` (defaults to now).
 *
 * A thin wrapper over getCategorySpendingInRange -- the trailing window is just
 * one way of naming a range. Kept with its original signature because it has
 * its own tests, which now exercise the shared implementation.
 */
export function getCategorySpendingLastNDays(
  transactions: Transaction[],
  days: number,
  referenceDate: Date = new Date()
): CategorySpend[] {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - days);
  return getCategorySpendingInRange(transactions, cutoff, referenceDate);
}

/**
 * Headline numbers for the KPI row.
 *
 * `avgDaily` divides by the days in the *selected range*, not by the days that
 * happen to have transactions -- a quiet week should pull the average down, not
 * vanish from the denominator. That's why this takes the range rather than
 * deriving it from the rows.
 */
export function getSummaryStats(
  transactions: Transaction[],
  range: DateRange
): SummaryStats {
  let totalSpent = 0;
  let totalIncome = 0;
  let spendCount = 0;
  let transactionCount = 0;
  let largestTransaction: Transaction | null = null;

  for (const txn of transactions) {
    const txnDate = parseTransactionDate(txn.date);
    if (txnDate < range.start || txnDate > range.end) {
      continue;
    }
    transactionCount += 1;

    if (isSpending(txn)) {
      totalSpent += Math.abs(txn.amount);
      spendCount += 1;
      if (
        largestTransaction === null ||
        Math.abs(txn.amount) > Math.abs(largestTransaction.amount)
      ) {
        largestTransaction = txn;
      }
    } else if (isIncome(txn)) {
      totalIncome += txn.amount;
    }
  }

  const days = daysInRange(range);

  return {
    totalSpent: round2(totalSpent),
    totalIncome: round2(totalIncome),
    net: round2(totalIncome - totalSpent),
    avgDaily: round2(totalSpent / days),
    avgWeekly: round2((totalSpent / days) * 7),
    spendCount,
    transactionCount,
    largestTransaction,
  };
}

/** First day of the ISO week (Monday) containing `date`. */
function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Shift so Monday starts the week.
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function bucketStartFor(date: Date, granularity: Granularity): Date {
  if (granularity === "monthly") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  if (granularity === "weekly") {
    return startOfWeek(date);
  }
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function advance(date: Date, granularity: Granularity): Date {
  const copy = new Date(date);
  if (granularity === "monthly") {
    copy.setMonth(copy.getMonth() + 1);
  } else if (granularity === "weekly") {
    copy.setDate(copy.getDate() + 7);
  } else {
    copy.setDate(copy.getDate() + 1);
  }
  return copy;
}

function bucketLabel(date: Date, granularity: Granularity): string {
  if (granularity === "monthly") {
    return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Spend and income bucketed over time.
 *
 * Empty buckets are emitted rather than skipped -- a week with no spending is
 * information, and dropping it would silently compress the x-axis and make a
 * gap look like continuity.
 */
export function getSpendTimeSeries(
  transactions: Transaction[],
  granularity: Granularity,
  range: DateRange
): TimeSeriesPoint[] {
  const buckets = new Map<string, TimeSeriesPoint>();

  // Seed every bucket across the range so gaps render as gaps.
  let cursor = bucketStartFor(range.start, granularity);
  while (cursor <= range.end) {
    buckets.set(toIsoDate(cursor), {
      bucketStart: toIsoDate(cursor),
      label: bucketLabel(cursor, granularity),
      spend: 0,
      income: 0,
    });
    cursor = advance(cursor, granularity);
  }

  for (const txn of transactions) {
    const txnDate = parseTransactionDate(txn.date);
    if (txnDate < range.start || txnDate > range.end) {
      continue;
    }
    const key = toIsoDate(bucketStartFor(txnDate, granularity));
    const point = buckets.get(key);
    if (!point) {
      continue;
    }
    if (isSpending(txn)) {
      point.spend += Math.abs(txn.amount);
    } else if (isIncome(txn)) {
      point.income += txn.amount;
    }
  }

  return [...buckets.values()].map((point) => ({
    ...point,
    spend: round2(point.spend),
    income: round2(point.income),
  }));
}

/** Merchants ranked by total spend or by number of purchases. */
export function getTopMerchants(
  transactions: Transaction[],
  sort: MerchantSort,
  limit: number
): MerchantTotal[] {
  const totals = new Map<string, MerchantTotal>();

  for (const txn of transactions) {
    if (!isSpending(txn)) {
      continue;
    }
    const merchant = txn.merchant || "Unknown";
    const entry = totals.get(merchant) ?? { merchant, total: 0, count: 0 };
    entry.total += Math.abs(txn.amount);
    entry.count += 1;
    totals.set(merchant, entry);
  }

  return [...totals.values()]
    .map((entry) => ({ ...entry, total: round2(entry.total) }))
    // Tie-break on the other dimension so the order is stable rather than
    // dependent on Map insertion order.
    .sort((a, b) =>
      sort === "spend" ? b.total - a.total || b.count - a.count : b.count - a.count || b.total - a.total
    )
    .slice(0, limit);
}
