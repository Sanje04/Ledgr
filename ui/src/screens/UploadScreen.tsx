import { useRef, useState } from "react";
import "../styles/UploadScreen.css";

export interface UploadScreenProps {
  onFileChosen: (file: File) => void;
  isReadingFile: boolean;
  parseError: string | null;
}

// The one shape backend/db.py's _parse_import_csv accepts. Deliberately not a
// list of generic bank layouts -- promising formats the importer would reject
// is worse than saying plainly what it reads.
const EXPECTED_COLUMNS = ["Transaction Type", "Date Posted", "Transaction Amount", "Description"];

function UploadScreen({
  onFileChosen,
  isReadingFile,
  parseError,
}: UploadScreenProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) {
      onFileChosen(file);
    }
  };

  return (
    <section className="upload-screen">
      <p className="upload-screen__overline">Import</p>
      <h2 className="upload-screen__heading">
        Turn a bank CSV into a picture of your spending.
      </h2>
      <p className="upload-screen__lede">
        Drop an export from your bank. Transactions are stored on your own backend and the
        dashboard builds itself.
      </p>

      <div
        className={`upload-screen__drop${isDragging ? " upload-screen__drop--active" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <span className="upload-screen__drop-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </span>
        <span className="upload-screen__drop-title">
          {isReadingFile ? "Reading your file…" : "Drop a CSV here, or choose a file"}
        </span>
        <span className="upload-screen__drop-hint">
          Importing replaces everything currently stored
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="upload-screen__input"
        aria-label="Choose a transactions CSV"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Reset so picking the same file twice still fires onChange.
          event.target.value = "";
        }}
      />

      {parseError !== null && (
        <div className="upload-screen__error" role="alert">
          {parseError}
        </div>
      )}

      <p className="upload-screen__overline upload-screen__overline--spaced">Format it reads</p>
      <div className="upload-screen__chips">
        {EXPECTED_COLUMNS.map((column) => (
          <code key={column} className="upload-screen__chip">
            {column}
          </code>
        ))}
      </div>
      <p className="upload-screen__note">
        Dates as <code>YYYYMMDD</code>, one <code>DEBIT</code> or <code>CREDIT</code> per row. A
        leading preamble and extra columns are fine.
      </p>

      <div className="upload-screen__privacy">
        <span className="upload-screen__privacy-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>
        <p>
          Your file is uploaded to the backend you're running and stored in your own MongoDB. The
          assistant reads it from there through its tools. Nothing is sent to a third party, and
          the model only sees what it asks for.
        </p>
      </div>
    </section>
  );
}

export default UploadScreen;
