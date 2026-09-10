import { useEffect, useState } from "react";
import { hasCookieConsent, setCookieConsent } from "../utils/consent";
import "../styles/CookieConsent.css";

function CookieConsent(): JSX.Element | null {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    setVisible(!hasCookieConsent());
  }, []);

  function handleAccept(): void {
    setCookieConsent();
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="cookie-consent" role="alert">
      <p>
        This app currently stores your chat history only in your browser (localStorage), not
        cookies. If that changes, this notice will reflect it.
      </p>
      <button type="button" onClick={handleAccept}>
        Got it
      </button>
    </div>
  );
}

export default CookieConsent;
