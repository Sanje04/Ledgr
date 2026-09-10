import { useState } from "react";
import LegalModal from "./LegalModal";
import { PRIVACY_POLICY_SECTIONS, TERMS_SECTIONS } from "../content/legal";
import "../styles/Footer.css";

type OpenModal = "privacy" | "terms" | null;

function Footer(): JSX.Element {
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  return (
    <>
      <footer className="app-footer">
        <button type="button" className="app-footer__link" onClick={() => setOpenModal("privacy")}>
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="app-footer__link" onClick={() => setOpenModal("terms")}>
          Terms &amp; Conditions
        </button>
      </footer>

      {openModal === "privacy" && (
        <LegalModal
          title="Privacy Policy"
          sections={PRIVACY_POLICY_SECTIONS}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "terms" && (
        <LegalModal title="Terms & Conditions" sections={TERMS_SECTIONS} onClose={() => setOpenModal(null)} />
      )}
    </>
  );
}

export default Footer;
