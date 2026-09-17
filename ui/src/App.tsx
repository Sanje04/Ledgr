import AppHeader from "./components/AppHeader";
import { AppError, AppLoading } from "./components/AppStatus";
import CookieConsent from "./components/CookieConsent";
import Footer from "./components/Footer";
import { useCsvImport } from "./hooks/useCsvImport";
import { useTransactions } from "./hooks/useTransactions";
import DashboardScreen from "./screens/DashboardScreen";
import PreviewScreen from "./screens/PreviewScreen";
import UploadScreen from "./screens/UploadScreen";
import "./App.css";

function App(): JSX.Element {
  const data = useTransactions();
  const importer = useCsvImport(data.reload);

  // Screen is derived from data state -- there's no router here.
  //
  // Order matters:
  //   - Preview sits ABOVE the error branch so a failed reload doesn't trap a
  //     user who has a file waiting to confirm or cancel.
  //   - The loading branch is gated on hasLoadedOnce so the post-import reload
  //     doesn't blank the dashboard back to a spinner; later reloads keep the
  //     current screen and show progress inline instead.
  //   - The error branch must come before the empty check: fetchTransactions
  //     collapses every failure into one string, so without it an unreachable
  //     backend would render the upload screen and invite the user to drop a
  //     file into nothing.
  function renderScreen(): JSX.Element {
    if (!data.hasLoadedOnce) {
      return <AppLoading />;
    }

    if (importer.pendingImport !== null) {
      return (
        <PreviewScreen
          pending={importer.pendingImport}
          onConfirm={importer.confirmImport}
          onCancel={importer.cancelImport}
          isImporting={importer.isImporting}
          importError={importer.importError}
        />
      );
    }

    if (data.status === "error") {
      return (
        <AppError
          message={data.error ?? "Something went wrong."}
          onRetry={() => {
            void data.reload();
          }}
          isRetrying={data.isFetching}
        />
      );
    }

    if (data.transactions.length === 0) {
      return (
        <UploadScreen
          onFileChosen={importer.chooseFile}
          isReadingFile={importer.isReadingFile}
          parseError={importer.parseError}
        />
      );
    }

    return (
      <DashboardScreen
        accounts={data.accounts}
        transactions={data.transactions}
        onFileChosen={importer.chooseFile}
        isReloading={data.isFetching}
      />
    );
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-sheet">{renderScreen()}</div>
      <Footer />
      <CookieConsent />
    </div>
  );
}

export default App;
