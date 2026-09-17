import "../styles/AppStatus.css";

/** Shown only for the very first fetch -- later reloads keep the screen. */
export function AppLoading(): JSX.Element {
  return (
    <div className="app-status" role="status">
      <span className="app-status__dots" aria-label="Loading">
        <span />
        <span />
        <span />
      </span>
      <p className="app-status__text">Loading your transactions…</p>
    </div>
  );
}

export interface AppErrorProps {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}

/**
 * The backend couldn't be reached.
 *
 * This state has to be distinct from "no transactions yet": fetchTransactions
 * collapses every failure into one string, so without this branch a dead
 * backend would render the upload screen and invite the user to drop a file
 * into nothing.
 */
export function AppError({ message, onRetry, isRetrying }: AppErrorProps): JSX.Element {
  return (
    <div className="app-status" role="alert">
      <span className="app-status__icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>
      <p className="app-status__heading">Can't reach the backend</p>
      <p className="app-status__text">{message}</p>
      <button
        type="button"
        className="app-status__retry"
        onClick={onRetry}
        disabled={isRetrying}
      >
        {isRetrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
