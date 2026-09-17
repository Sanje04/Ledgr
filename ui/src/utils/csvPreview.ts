// Client-side CSV reading for the import preview screen.
//
// IMPORTANT -- this is display-only, advisory UI. It mirrors the backend's
// column *detection* (backend/db.py `_find_statement_header` / `_find_column`)
// so the preview can say which columns it found, and nothing else. It
// deliberately does NOT reproduce `_parse_import_csv`'s validation, the
// DEBIT/CREDIT sign flip, `_derive_merchant` or `_classify_import_category`:
// the raw file is POSTed unmodified and the backend stays the single authority
// on whether an import is valid, per the all-or-nothing rule in CLAUDE.md.
//
// Consequences that are intentional, not oversights:
//   - the table shows the file's own raw cells, never a derived merchant or
//     category, so nothing here can disagree with what gets stored;
//   - a file whose header we can't find is still submittable -- we say we
//     couldn't read it and let the server decide.
import type { CsvColumnRole, CsvPreview, CsvPreviewColumn } from "../types/dashboard";

// Same keyword sets as backend/db.py's _STATEMENT_*_COLUMN: a column matches
// when its lowercased name contains every keyword.
const COLUMN_KEYWORDS: ReadonlyArray<{ role: Exclude<CsvColumnRole, "ignored">; keywords: string[] }> = [
  { role: "type", keywords: ["transaction", "type"] },
  { role: "date", keywords: ["date"] },
  { role: "amount", keywords: ["amount"] },
  { role: "description", keywords: ["description"] },
];

/**
 * Minimal RFC-4180 reader: handles quoted fields, escaped quotes and newlines
 * inside quotes. Enough for a bank export, and small enough not to warrant a
 * dependency.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const source = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function roleFor(name: string): CsvColumnRole {
  const lowered = name.trim().toLowerCase();
  for (const { role, keywords } of COLUMN_KEYWORDS) {
    if (keywords.every((keyword) => lowered.includes(keyword))) {
      return role;
    }
  }
  return "ignored";
}

/**
 * Read a picked file far enough to show the user what's in it.
 *
 * Bank exports carry a free-text preamble before the real header, so the header
 * is located by content -- the row containing both "transaction type" and
 * "date posted" -- exactly as the backend does, rather than assuming line 1.
 */
export function parseCsvPreview(text: string, fileName: string, maxRows = 12): CsvPreview {
  const rows = parseCsvRows(text).filter((row) => !isBlankRow(row));

  let headerPos = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i].map((cell) => cell.trim().toLowerCase());
    if (cells.includes("transaction type") && cells.includes("date posted")) {
      headerPos = i;
      break;
    }
  }

  if (headerPos === -1) {
    return {
      headerFound: false,
      columns: [],
      rows: rows.slice(0, maxRows),
      totalDataRows: 0,
      fileName,
    };
  }

  const header = rows[headerPos];
  const seen = new Set<CsvColumnRole>();
  const columns: CsvPreviewColumn[] = header.map((name, index) => {
    const role = roleFor(name);
    // The backend takes the FIRST column matching each keyword set, so a second
    // date-ish column is ignored. Mirror that, or the preview would label a
    // column the import will not actually read.
    if (role !== "ignored" && seen.has(role)) {
      return { name: name.trim(), role: "ignored", index };
    }
    if (role !== "ignored") {
      seen.add(role);
    }
    return { name: name.trim(), role, index };
  });

  const dataRows = rows.slice(headerPos + 1);

  return {
    headerFound: true,
    columns,
    rows: dataRows.slice(0, maxRows),
    totalDataRows: dataRows.length,
    fileName,
  };
}
