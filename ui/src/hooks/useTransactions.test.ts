import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useTransactions } from "./useTransactions";
import type { Transaction } from "../types";

vi.mock("../services/transactions", () => ({
  fetchTransactions: vi.fn(),
}));

const { fetchTransactions } = await import("../services/transactions");
const mockFetch = vi.mocked(fetchTransactions);

function txn(id: string, date: string): Transaction {
  return {
    id,
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

describe("useTransactions", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("loads accounts and re-sorts transactions oldest-first", async () => {
    // The endpoint returns newest-first; every aggregate downstream wants the
    // opposite, and relies on this hook to have already done it.
    mockFetch.mockResolvedValue({
      accounts: [{ id: "checking", name: "Checking", type: "checking", current_balance: 100 }],
      transactions: [txn("new", "2026-09-10T00:00:00Z"), txn("old", "2026-09-01T00:00:00Z")],
    });

    const { result } = renderHook(() => useTransactions());

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.transactions.map((t) => t.id)).toEqual(["old", "new"]);
    expect(result.current.hasLoadedOnce).toBe(true);
  });

  it("surfaces a load failure as an error status rather than an empty dataset", async () => {
    // This distinction is what stops a dead backend from rendering the upload
    // screen and inviting the user to drop a file into nothing.
    mockFetch.mockRejectedValue(new Error("Error: Unable to load transactions."));

    const { result } = renderHook(() => useTransactions());

    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.error).toBe("Error: Unable to load transactions.");
    expect(result.current.transactions).toEqual([]);
    expect(result.current.hasLoadedOnce).toBe(true);
  });
});
