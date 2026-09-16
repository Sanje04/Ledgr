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

  it("imports a CSV with a user-given account name/type and reloads transactions on success", async () => {
    vi.mocked(transactionsService.fetchTransactions).mockResolvedValue(mockData);
    vi.mocked(transactionsService.importTransactionsCsv).mockResolvedValue({
      imported_count: 3,
      accounts: mockData.accounts,
    });

    render(<TransactionsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    });

    const file = new File(["Transaction Type,Date Posted,Transaction Amount,Description\n"], "statement.csv", {
      type: "text/csv",
    });
    fireEvent.change(screen.getByLabelText("Import transactions CSV"), { target: { files: [file] } });

    fireEvent.change(screen.getByPlaceholderText("e.g. My Card"), { target: { value: "My Card" } });
    fireEvent.change(screen.getByDisplayValue("Checking"), { target: { value: "savings" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("Imported 3 transactions.")).toBeInTheDocument();
    });
    expect(transactionsService.importTransactionsCsv).toHaveBeenCalledWith(file, "My Card", "savings", 0);
  });

  it("shows a validation error and does not call the import service when no account name is given", async () => {
    vi.mocked(transactionsService.fetchTransactions).mockResolvedValue(mockData);
    vi.mocked(transactionsService.importTransactionsCsv).mockClear();

    render(<TransactionsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    });

    const file = new File(["Transaction Type,Date Posted,Transaction Amount,Description\n"], "statement.csv", {
      type: "text/csv",
    });
    fireEvent.change(screen.getByLabelText("Import transactions CSV"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Account name is required.")).toBeInTheDocument();
    expect(transactionsService.importTransactionsCsv).not.toHaveBeenCalled();
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
