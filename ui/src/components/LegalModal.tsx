import { useEffect } from "react";
import type { LegalSection } from "../content/legal";
import "../styles/LegalModal.css";

export interface LegalModalProps {
  title: string;
  sections: LegalSection[];
  onClose: () => void;
}

function LegalModal({ title, sections, onClose }: LegalModalProps): JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="legal-modal__overlay" onClick={onClose}>
      <div
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="legal-modal__header">
          <h2 id="legal-modal-title">{title}</h2>
          <button type="button" className="legal-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="legal-modal__body">
          {sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LegalModal;
