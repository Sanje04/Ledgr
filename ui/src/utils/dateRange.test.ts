import { describe, expect, it } from "vitest";
import { availableRanges, clampGranularity, dateRangeFor, daysInRange } from "./dateRange";
import type { Transaction } from "../types";

function txn(date: string): Transaction {
  return {
    id: date,
    account_id: "checking",
    account_name: "Checking",
    account_type: "checking",
    date,
    amount: -10,
    merchant: "Test",
    description: "test",
    category: "Groceries",
    running_balance: 0,
  };
}

describe("dateRangeFor", () => {
  it("anchors the window to the newest transaction, not to today", () => {
    // An imported statement that ended months ago must still show data --
    // anchoring "30 days" to today would render an empty dashboard.
    const rows = [txn("2026-03-01T00:00:00Z"), txn("2026-05-20T00:00:00Z")];
    const range = dateRangeFor("30d", rows, new Date("2026-09-16T00:00:00Z"));

    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(4); // May
    expect(daysInRange(range)).toBe(30);
  });

  it("spans earliest to latest for 'all'", () => {
    const rows = [txn("2026-01-10T00:00:00Z"), txn("2026-03-11T00:00:00Z")];
    const range = dateRangeFor("all", rows, new Date("2026-09-16T00:00:00Z"));

    expect(range.start.getMonth()).toBe(0);
    expect(range.end.getMonth()).toBe(2);
  });
});

describe("availableRanges", () => {
  it("omits ranges wider than the data, which would just duplicate 'All'", () => {
    // Two months of history: a 30-day window is a real narrowing, but 90d/6m/1y
    // would each show exactly what "All" shows.
    const rows = [txn("2026-07-01T00:00:00Z"), txn("2026-09-01T00:00:00Z")];

    expect(availableRanges(rows, new Date("2026-09-16T00:00:00Z"))).toEqual(["30d", "all"]);
  });
});

describe("clampGranularity", () => {
  it("keeps the user's choice when the range supports it", () => {
    const range = dateRangeFor("90d", [txn("2026-09-01T00:00:00Z")], new Date("2026-09-16T00:00:00Z"));

    expect(clampGranularity("weekly", range)).toBe("weekly");
  });

  it("clamps monthly down on a short range and daily up on a long one", () => {
    const now = new Date("2026-09-16T00:00:00Z");
    const short = dateRangeFor("30d", [txn("2026-09-01T00:00:00Z")], now);
    const long = dateRangeFor("1y", [txn("2026-09-01T00:00:00Z")], now);

    expect(clampGranularity("monthly", short)).toBe("daily");
    expect(clampGranularity("daily", long)).toBe("weekly");
  });
});
