import { parseTransactionDate } from "./dateRange";

// Shared display formatters.
//
// formatCurrency/formatDate were previously duplicated in TransactionsPanel and
// CategorySpendingChart; the dashboard's cards would have made that a dozen
// copies. One home instead.

// The app is USD-only, so the locale is pinned to en-US rather than left to
// the browser. On a non-US locale the default renders USD as "US$1,234.56",
// which is both two characters wider than the KPI tiles allow and not the
// "$50.68" form the design system specifies.
const CURRENCY_LOCALE = "en-US";

/** "$1,234.56" -- unsigned, for totals and balances. */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString(CURRENCY_LOCALE, {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Signed money, with the sign spaced away from the figure ("- $50.68", not
 * "-$50.68") and a real minus sign rather than a hyphen -- the design system
 * specifies both. `always` also shows "+" on inflows.
 */
export function formatSignedCurrency(
  amount: number,
  sign: "negative-only" | "always" = "negative-only"
): string {
  const magnitude = formatCurrency(Math.abs(amount));
  if (amount < 0) {
    return `− ${magnitude}`;
  }
  return sign === "always" ? `+ ${magnitude}` : magnitude;
}

/** Compact money for chart axis ticks, where space is tight: "$1.2k". */
export function formatCompactCurrency(amount: number): string {
  const magnitude = Math.abs(amount);
  if (magnitude >= 1000) {
    return `$${(amount / 1000).toFixed(magnitude >= 10000 ? 0 : 1)}k`;
  }
  return `$${Math.round(amount)}`;
}

/** "Sep 16, 2026" */
export function formatDate(iso: string): string {
  const date = parseTransactionDate(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Sep 16" -- for dense rows and axis labels where the year is implied. */
export function formatShortDate(iso: string): string {
  const date = parseTransactionDate(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
