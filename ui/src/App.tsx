import ChatWindow from "./components/ChatWindow";
import Footer from "./components/Footer";
import CookieConsent from "./components/CookieConsent";
import "./App.css";

function App(): JSX.Element {
  return (
    <div className="app-shell">
      <ChatWindow />
      <Footer />
      <CookieConsent />
    </div>
  );
}

export default App;
