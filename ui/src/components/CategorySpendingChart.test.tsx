import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategorySpendingChart from "./CategorySpendingChart";
import type { CategorySpend } from "../utils/spending";

describe("CategorySpendingChart", () => {
  it("shows an empty state naming the active range", () => {
    render(
      <CategorySpendingChart
        data={[]}
        selectedCategory={null}
        onSelectCategory={() => {}}
        rangeLabel="last 30 days"
      />
    );

    expect(screen.getByText(/no spending in the last 30 days/i)).toBeInTheDocument();
  });

  it("renders a legend row per category with its total, in fixed category order", () => {
    // Order comes from the caller (spending.ts emits CATEGORY_ORDER), and the
    // chart must not re-sort it by amount.
    const data: CategorySpend[] = [
      { category: "Groceries", total: 50 },
      { category: "Rent", total: 1000 },
    ];

    render(
      <CategorySpendingChart
        data={data}
        selectedCategory={null}
        onSelectCategory={() => {}}
        rangeLabel="last 30 days"
      />
    );

    const labels = screen.getAllByText(/Groceries|Rent/).map((el) => el.textContent);
    expect(labels).toEqual(["Groceries", "Rent"]);
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });

  it("toggles the filter off when the already-selected legend row is clicked", async () => {
    // Without this the donut is a one-way trip: click a category and there's no
    // way back to the unfiltered view from the chart itself.
    const onSelectCategory = vi.fn();
    const data: CategorySpend[] = [{ category: "Groceries", total: 50 }];

    render(
      <CategorySpendingChart
        data={data}
        selectedCategory="Groceries"
        onSelectCategory={onSelectCategory}
        rangeLabel="last 30 days"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Groceries/ }));

    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });
});
