// Recurring-payment and anomaly detection.
//
// Separate from spending.ts because this is statistical inference over grouped
// history rather than summation -- different failure modes, different tests.
//
// Both functions expect the FULL transaction history, not a range-filtered
// slice, and both are heuristics with no backend support behind them.
import type { Transaction } from "../types";
import type { Anomaly, Cadence, RecurringSeries } from "../types/dashboard";
import { parseTransactionDate, toIsoDate } from "./dateRange";
import { NON_SPENDING_CATEGORIES, isIncome, isSpending } from "./spending";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const CADENCES: ReadonlyArray<{ name: Cadence; days: number; tolerance: number }> = [
  { name: "weekly", days: 7, tolerance: 2 },
  { name: "biweekly", days: 14, tolerance: 3 },
  { name: "monthly", days: 30.4, tolerance: 6 },
];

/** Minimum occurrences before a repeating charge is worth calling a pattern. */
const MIN_OCCURRENCES = 3;
/** Fraction of gaps that must sit within tolerance of the matched cadence. */
const MIN_CONSISTENCY = 0.6;
/** Reject a series whose amounts swing more than this share of their average. */
const MAX_AMOUNT_SPREAD = 0.6;

/**
 * Subscriptions, rent, payroll -- anything arriving on a regular cadence for a
 * roughly steady amount.
 *
 * Pass the full history: a 30-day window yields two or three samples per
 * merchant, which is not enough to distinguish a cadence from a coincidence.
 * Internal transfers are excluded (they're regular by nature and would crowd
 * out real findings), but income IS included, since "when does payroll land"
 * is exactly the kind of pattern worth surfacing.
 */
export function detectRecurring(transactions: Transaction[]): RecurringSeries[] {
  const groups = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    if (NON_SPENDING_CATEGORIES.has(txn.category) && txn.category !== "Income") {
      continue;
    }
    if (!isSpending(txn) && !isIncome(txn)) {
      continue;
    }
    const merchant = txn.merchant || "Unknown";
    const group = groups.get(merchant) ?? [];
    group.push(txn);
    groups.set(merchant, group);
  }

  const series: RecurringSeries[] = [];

  for (const [merchant, group] of groups) {
    if (group.length < MIN_OCCURRENCES) {
      continue;
    }

    const sorted = [...group].sort(
      (a, b) => parseTransactionDate(a.date).getTime() - parseTransactionDate(b.date).getTime()
    );

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const delta =
        parseTransactionDate(sorted[i].date).getTime() -
        parseTransactionDate(sorted[i - 1].date).getTime();
      gaps.push(delta / 86_400_000);
    }

    const medianGap = median(gaps);
    const cadence = CADENCES.find((c) => Math.abs(medianGap - c.days) <= c.tolerance);
    if (!cadence) {
      continue;
    }

    const withinTolerance = gaps.filter(
      (gap) => Math.abs(gap - cadence.days) <= cadence.tolerance * 1.6
    ).length;
    if (withinTolerance / gaps.length < MIN_CONSISTENCY) {
      continue;
    }

    const amounts = sorted.map((txn) => Math.abs(txn.amount));
    const average = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (average === 0 || spread / average > MAX_AMOUNT_SPREAD) {
      continue;
    }

    const last = sorted[sorted.length - 1];
    const nextExpected = parseTransactionDate(last.date);
    nextExpected.setDate(nextExpected.getDate() + Math.round(cadence.days));

    series.push({
      merchant,
      category: last.category,
      cadence: cadence.name,
      medianGapDays: Math.round(medianGap),
      averageAmount: round2(average),
      occurrences: sorted.length,
      lastDate: last.date,
      nextExpectedDate: toIsoDate(nextExpected),
      isIncome: last.amount > 0,
      monthlyAmount: round2(average * (30.4 / cadence.days)),
    });
  }

  // Rank by monthly cost so a weekly $20 charge outranks a monthly $50 one.
  return series.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

/** Below this, a category's own history is too thin to be a baseline. */
const DEFAULT_MIN_SAMPLES = 5;
/** How many times the baseline a transaction must exceed to be called unusual. */
const DEFAULT_MULTIPLE = 3;

export interface AnomalyOptions {
  minSamples?: number;
  multiple?: number;
}

/**
 * Transactions far larger than what's normal for their category.
 *
 * Median-based rather than mean/standard-deviation: the outliers being looked
 * for are exactly the values that would drag a mean upward and hide themselves.
 *
 * When a category has fewer than `minSamples` rows its own median is noise, so
 * the comparison falls back to a global spending baseline. That fallback is
 * load-bearing rather than defensive -- imported statements are almost entirely
 * "Other" (backend/db.py's `_classify_import_category` only distinguishes
 * transfers), so without it this card would be empty or meaningless on exactly
 * the data a real user brings.
 */
export function detectAnomalies(
  transactions: Transaction[],
  options: AnomalyOptions = {}
): Anomaly[] {
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;
  const multiple = options.multiple ?? DEFAULT_MULTIPLE;

  const spending = transactions.filter(isSpending);
  if (spending.length === 0) {
    return [];
  }

  const byCategory = new Map<string, number[]>();
  for (const txn of spending) {
    const amounts = byCategory.get(txn.category) ?? [];
    amounts.push(Math.abs(txn.amount));
    byCategory.set(txn.category, amounts);
  }

  const globalMedian = median(spending.map((txn) => Math.abs(txn.amount)));
  const categoryMedians = new Map<string, number>();
  for (const [category, amounts] of byCategory) {
    if (amounts.length >= minSamples) {
      categoryMedians.set(category, median(amounts));
    }
  }

  const anomalies: Anomaly[] = [];

  for (const txn of spending) {
    const categoryMedian = categoryMedians.get(txn.category);
    const usesCategory = categoryMedian !== undefined && categoryMedian > 0;
    const baseline = usesCategory ? categoryMedian : globalMedian;
    if (baseline <= 0) {
      continue;
    }

    const ratio = Math.abs(txn.amount) / baseline;
    if (ratio < multiple) {
      continue;
    }

    anomalies.push({
      transaction: txn,
      baselineLabel: usesCategory ? txn.category : "all spending",
      baselineMedian: round2(baseline),
      multiple: Math.round(ratio * 10) / 10,
    });
  }

  return anomalies.sort((a, b) => b.multiple - a.multiple);
}
