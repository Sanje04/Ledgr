import ThemeToggle from "./ThemeToggle";
import "../styles/AppHeader.css";

/**
 * The brand band across the top of every screen.
 *
 * Rendered outside App's screen switch so the app never flashes a bare page
 * while the first fetch is in flight.
 */
function AppHeader(): JSX.Element {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" />
          </svg>
        </span>
        <h1 className="app-header__title">
          Tender <span className="app-header__title-accent">Analyzer</span>
        </h1>
      </div>
      <ThemeToggle />
    </header>
  );
}

export default AppHeader;
