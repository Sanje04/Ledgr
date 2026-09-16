import type { Transaction } from "../types";

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
const NON_SPENDING_CATEGORIES = new Set(["Transfer", "Income"]);

export interface CategorySpend {
  category: string;
  total: number;
}

/**
 * Total spend per category over the trailing `days` window ending at
 * `referenceDate` (defaults to now). Categories outside CATEGORY_ORDER are
 * folded into "Other". Returned in the fixed CATEGORY_ORDER (then "Other"
 * last) with zero-spend categories omitted -- never sorted by amount.
 */
export function getCategorySpendingLastNDays(
  transactions: Transaction[],
  days: number,
  referenceDate: Date = new Date()
): CategorySpend[] {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - days);

  const totals = new Map<string, number>();

  for (const txn of transactions) {
    if (txn.amount >= 0 || NON_SPENDING_CATEGORIES.has(txn.category)) {
      continue;
    }
    const txnDate = new Date(txn.date);
    if (txnDate < cutoff || txnDate > referenceDate) {
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
      ordered.push({ category, total: Math.round(total * 100) / 100 });
    }
  }
  const otherTotal = totals.get(OTHER_CATEGORY);
  if (otherTotal) {
    ordered.push({ category: OTHER_CATEGORY, total: Math.round(otherTotal * 100) / 100 });
  }

  return ordered;
}
