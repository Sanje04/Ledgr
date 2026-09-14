import ChatWindow from "./components/ChatWindow";
import TransactionsPanel from "./components/TransactionsPanel";
import Footer from "./components/Footer";
import CookieConsent from "./components/CookieConsent";
import "./App.css";

function App(): JSX.Element {
  return (
    <div className="app-shell">
      <div className="main-layout">
        <ChatWindow />
        <TransactionsPanel />
      </div>
      <Footer />
      <CookieConsent />
    </div>
  );
}

export default App;
