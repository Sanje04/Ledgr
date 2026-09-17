import { describe, expect, it } from "vitest";
import { parseCsvPreview } from "./csvPreview";

// Shaped like a real bank export: a free-text preamble before the header.
const STATEMENT = `Following data is valid as of 20260916.

First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description
1234,DEBIT,20260914,-42.10,POS PURCHASE TRADER JOES #123
1234,CREDIT,20260913,2800.00,DIRECT DEP PAYROLL
`;

describe("parseCsvPreview", () => {
  it("finds the header past the preamble and labels the columns it will read", () => {
    const preview = parseCsvPreview(STATEMENT, "statement.csv");

    expect(preview.headerFound).toBe(true);
    expect(preview.totalDataRows).toBe(2);
    expect(preview.columns.map((c) => c.role)).toEqual([
      "ignored", // First Bank Card
      "type",
      "date",
      "amount",
      "description",
    ]);
  });

  it("returns the file's own raw cells, never a derived merchant or category", () => {
    // The backend owns categorization and the DEBIT/CREDIT sign flip; the
    // preview must not second-guess either, or the two could disagree.
    const preview = parseCsvPreview(STATEMENT, "statement.csv");

    expect(preview.rows[0]).toEqual([
      "1234",
      "DEBIT",
      "20260914",
      "-42.10",
      "POS PURCHASE TRADER JOES #123",
    ]);
  });

  it("reports an unreadable header rather than throwing, leaving the server to decide", () => {
    const preview = parseCsvPreview("Date,Payee,Amount\n2026-09-14,Coffee,-4.50\n", "other.csv");

    expect(preview.headerFound).toBe(false);
    expect(preview.columns).toEqual([]);
  });
});
