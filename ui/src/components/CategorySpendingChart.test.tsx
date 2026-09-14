import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CategorySpendingChart from "./CategorySpendingChart";
import type { Transaction } from "../types";

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: "1",
    account_id: "checking",
    account_name: "Checking",
    account_type: "checking",
    date: new Date().toISOString(),
    amount: -10,
    merchant: "Test",
    description: "test",
    category: "Groceries",
    running_balance: 0,
    ...overrides,
  };
}

describe("CategorySpendingChart", () => {
  it("shows an empty state when there is no recent spending", () => {
    render(<CategorySpendingChart transactions={[]} />);

    expect(screen.getByText(/no spending in the last 30 days/i)).toBeInTheDocument();
  });

  it("renders a legend row per category with its total, in fixed category order", () => {
    const recent = new Date().toISOString();
    const txns: Transaction[] = [
      txn({ id: "1", category: "Rent", amount: -1000, date: recent }),
      txn({ id: "2", category: "Groceries", amount: -50, date: recent }),
      txn({ id: "3", category: "Income", amount: 2800, date: recent }), // excluded
    ];

    render(<CategorySpendingChart transactions={txns} />);

    const labels = screen.getAllByText(/Groceries|Rent/).map((el) => el.textContent);
    expect(labels).toEqual(["Groceries", "Rent"]); // fixed order, not amount-sorted
    expect(screen.getByText("US$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("US$50.00")).toBeInTheDocument();
  });
});
