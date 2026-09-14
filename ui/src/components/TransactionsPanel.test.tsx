import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TransactionsPanel from "./TransactionsPanel";
import * as transactionsService from "../services/transactions";
import type { TransactionsResponse } from "../types";

vi.mock("../services/transactions");

const mockData: TransactionsResponse = {
  accounts: [
    { id: "checking", name: "Checking", type: "checking", current_balance: 100 },
    { id: "savings", name: "Savings", type: "savings", current_balance: 500 },
  ],
  transactions: [
    {
      id: "1",
      account_id: "checking",
      account_name: "Checking",
      account_type: "checking",
      date: "2026-08-01T00:00:00Z",
      amount: -50,
      merchant: "Whole Foods",
      description: "Groceries",
      category: "Groceries",
      running_balance: 50,
    },
    {
      id: "2",
      account_id: "savings",
      account_name: "Savings",
      account_type: "savings",
      date: "2026-08-02T00:00:00Z",
      amount: 20,
      merchant: "Bank Interest",
      description: "Interest earned",
      category: "Income",
      running_balance: 520,
    },
  ],
};

describe("TransactionsPanel", () => {
  it("renders accounts and transactions once loaded", async () => {
    vi.mocked(transactionsService.fetchTransactions).mockResolvedValue(mockData);

    render(<TransactionsPanel />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    });
    // "Checking" appears twice (account name + transaction's account tag).
    expect(screen.getAllByText("Checking").length).toBeGreaterThan(0);
  });

  it("filters the transaction list by account when a filter button is clicked", async () => {
    vi.mocked(transactionsService.fetchTransactions).mockResolvedValue(mockData);

    render(<TransactionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    });
    expect(screen.getByText("Bank Interest")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Savings" }));

    expect(screen.queryByText("Whole Foods")).not.toBeInTheDocument();
    expect(screen.getByText("Bank Interest")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(transactionsService.fetchTransactions).mockRejectedValue(
      new Error("Error: Unable to load transactions. Please try again.")
    );

    render(<TransactionsPanel />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Error: Unable to load transactions. Please try again."
      );
    });
  });
});
