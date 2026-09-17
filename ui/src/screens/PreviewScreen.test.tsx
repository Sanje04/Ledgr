import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreviewScreen from "./PreviewScreen";
import type { PendingImport } from "../hooks/useCsvImport";

function pending(): PendingImport {
  return {
    file: new File(["x"], "statement.csv", { type: "text/csv" }),
    preview: {
      headerFound: true,
      columns: [
        { name: "Transaction Type", role: "type", index: 0 },
        { name: "Date Posted", role: "date", index: 1 },
        { name: "Transaction Amount", role: "amount", index: 2 },
        { name: "Description", role: "description", index: 3 },
      ],
      rows: [["DEBIT", "20260914", "-42.10", "TRADER JOES"]],
      totalDataRows: 1,
      fileName: "statement.csv",
    },
  };
}

describe("PreviewScreen", () => {
  it("requires an account name before it will submit", async () => {
    const onConfirm = vi.fn();
    render(
      <PreviewScreen
        pending={pending()}
        onConfirm={onConfirm}
        onCancel={() => {}}
        isImporting={false}
        importError={null}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /import transactions/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/account name is required/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("passes the account details through on submit", async () => {
    const onConfirm = vi.fn();
    render(
      <PreviewScreen
        pending={pending()}
        onConfirm={onConfirm}
        onCancel={() => {}}
        isImporting={false}
        importError={null}
      />
    );

    await userEvent.type(screen.getByLabelText(/account name/i), "My Card");
    await userEvent.click(screen.getByRole("button", { name: /import transactions/i }));

    expect(onConfirm).toHaveBeenCalledWith("My Card", "checking", 0);
  });

  it("shows the backend's row-numbered rejection without discarding the form", async () => {
    // The server rejects on a single bad row; landing the user back on an empty
    // upload screen would throw away everything they just filled in.
    render(
      <PreviewScreen
        pending={pending()}
        onConfirm={() => {}}
        onCancel={() => {}}
        isImporting={false}
        importError="Row 340: invalid date '2026-13-01'. Expected YYYYMMDD."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/Row 340/);
    expect(screen.getByLabelText(/account name/i)).toBeInTheDocument();
  });
});
