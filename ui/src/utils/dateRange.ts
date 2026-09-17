// Calendar/range helpers for the dashboard's time filter. Pure date arithmetic
// only -- no spending math (that lives in spending.ts).
import type { Transaction } from "../types";
import type { DateRange, Granularity, TimeRange } from "../types/dashboard";

export const TIME_RANGES: readonly TimeRange[] = ["30d", "90d", "6m", "1y", "all"] as const;

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "6m": "6 months",
  "1y": "1 year",
  all: "All",
};

/** Approximate span of each range in days, used only to order/compare them. */
const RANGE_DAYS: Record<Exclude<TimeRange, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "6m": 183,
  "1y": 365,
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/**
 * Parse a transaction's `date`.
 *
 * Backend dates are naive ISO strings -- no `Z`, no offset -- because the Motor
 * client isn't tz_aware. A bare `YYYY-MM-DD` would be read as UTC midnight and
 * land on the previous day in negative-offset timezones, so it's pinned to
 * local midnight instead. One copy, imported everywhere: this was duplicated
 * six ways before.
 */
export function parseTransactionDate(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

/** `YYYY-MM-DD` in LOCAL time -- `toISOString()` would shift the day. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The newest transaction date, or `now` when there are none.
 *
 * Ranges are anchored to the data rather than to today on purpose: an imported
 * statement can end weeks ago, and anchoring "30 days" to today would show an
 * empty dashboard for data that is perfectly fine.
 */
function latestDate(transactions: Transaction[], now: Date): Date {
  let latest: Date | null = null;
  for (const txn of transactions) {
    const date = parseTransactionDate(txn.date);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    if (latest === null || date > latest) {
      latest = date;
    }
  }
  return latest ?? now;
}

function earliestDate(transactions: Transaction[], fallback: Date): Date {
  let earliest: Date | null = null;
  for (const txn of transactions) {
    const date = parseTransactionDate(txn.date);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    if (earliest === null || date < earliest) {
      earliest = date;
    }
  }
  return earliest ?? fallback;
}

/** Resolve a range pill to concrete start/end bounds over the given data. */
export function dateRangeFor(
  range: TimeRange,
  transactions: Transaction[],
  now: Date = new Date()
): DateRange {
  const end = endOfDay(latestDate(transactions, now));

  if (range === "all") {
    return { start: startOfDay(earliestDate(transactions, end)), end };
  }

  const start = new Date(end);
  if (range === "6m") {
    start.setMonth(start.getMonth() - 6);
  } else if (range === "1y") {
    start.setFullYear(start.getFullYear() - 1);
  } else {
    start.setDate(start.getDate() - RANGE_DAYS[range]);
  }
  // Both ends are inclusive (start-of-day to end-of-day), so subtracting a
  // full 30 days would span 31 calendar days. Step forward one so "30 days"
  // covers exactly 30.
  start.setDate(start.getDate() + 1);
  return { start: startOfDay(start), end };
}

/** Whole days covered by a range, at least 1 so it's safe as a divisor. */
export function daysInRange(range: DateRange): number {
  const ms = range.end.getTime() - range.start.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * Which range pills are worth offering for this dataset. A range wider than
 * the data itself shows exactly what "All" shows, so offering both invites the
 * user to click between two identical views.
 */
export function availableRanges(
  transactions: Transaction[],
  now: Date = new Date()
): TimeRange[] {
  if (transactions.length === 0) {
    return ["all"];
  }
  const span = daysInRange(dateRangeFor("all", transactions, now));
  const available: TimeRange[] = [];
  for (const range of TIME_RANGES) {
    if (range === "all") {
      available.push(range);
    } else if (RANGE_DAYS[range] < span) {
      available.push(range);
    }
  }
  return available;
}

/**
 * The granularity actually used to draw the chart.
 *
 * Kept as a pure function of the user's preference and the current range, and
 * called at render -- never mirrored into state via an effect. Monthly buckets
 * over a 30-day window give one or two bars, and daily buckets over a year give
 * 365; clamping keeps the chart readable without silently overwriting what the
 * user picked, so widening the range restores their choice.
 */
export function clampGranularity(preferred: Granularity, range: DateRange): Granularity {
  const days = daysInRange(range);

  if (days <= 45) {
    return "daily";
  }
  if (days <= 120) {
    return preferred === "monthly" ? "weekly" : preferred;
  }
  if (days <= 400) {
    return preferred === "daily" ? "weekly" : preferred;
  }
  return "monthly";
}
