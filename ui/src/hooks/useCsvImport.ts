import { useCallback, useState } from "react";
import { importTransactionsCsv } from "../services/transactions";
import { parseCsvPreview } from "../utils/csvPreview";
import type { AccountType } from "../types";
import type { CsvPreview } from "../types/dashboard";

export interface PendingImport {
  file: File;
  preview: CsvPreview;
}

export interface UseCsvImportResult {
  pendingImport: PendingImport | null;
  isReadingFile: boolean;
  /** A client-side file-read failure only -- never a validation verdict. */
  parseError: string | null;
  isImporting: boolean;
  /** The backend's message, passed through verbatim (row numbers included). */
  importError: string | null;
  chooseFile: (file: File) => void;
  cancelImport: () => void;
  confirmImport: (
    accountName: string,
    accountType: AccountType,
    openingBalance: number
  ) => Promise<void>;
}

/**
 * Drives choose-file -> preview -> confirm -> POST -> reload.
 *
 * The preview it builds is advisory only: the raw, unmodified file is what gets
 * POSTed, so backend/db.py's all-or-nothing validation stays the single
 * authority on whether an import is valid. Nothing here can reject a file.
 */
export function useCsvImport(onImported: () => Promise<void>): UseCsvImportResult {
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const chooseFile = useCallback((file: File) => {
    setParseError(null);
    setImportError(null);
    setIsReadingFile(true);

    const reader = new FileReader();

    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setPendingImport({ file, preview: parseCsvPreview(text, file.name) });
      setIsReadingFile(false);
    };

    reader.onerror = () => {
      // Couldn't read the file at all -- distinct from "the file is invalid",
      // which only the server gets to say.
      setParseError("Couldn't read that file. Check it's a readable .csv and try again.");
      setIsReadingFile(false);
    };

    reader.readAsText(file);
  }, []);

  const cancelImport = useCallback(() => {
    setPendingImport(null);
    setImportError(null);
  }, []);

  const confirmImport = useCallback(
    async (accountName: string, accountType: AccountType, openingBalance: number) => {
      if (!pendingImport) {
        return;
      }
      setIsImporting(true);
      setImportError(null);

      try {
        await importTransactionsCsv(pendingImport.file, accountName, accountType, openingBalance);
        setPendingImport(null);
        await onImported();
      } catch (err) {
        // Deliberately keeps pendingImport set. The server rejects on a single
        // bad row, and the user should land back on their filled-in form with
        // the row number shown -- not back at an empty upload screen.
        setImportError(
          err instanceof Error ? err.message : "Import failed. Please try again."
        );
      } finally {
        setIsImporting(false);
      }
    },
    [pendingImport, onImported]
  );

  return {
    pendingImport,
    isReadingFile,
    parseError,
    isImporting,
    importError,
    chooseFile,
    cancelImport,
    confirmImport,
  };
}
