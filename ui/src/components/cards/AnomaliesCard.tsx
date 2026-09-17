import type { Anomaly } from "../../types/dashboard";
import { formatCurrency, formatShortDate } from "../../utils/format";

export interface AnomaliesCardProps {
  anomalies: Anomaly[];
  onSelectMerchant: (merchant: string) => void;
}

/** Unusually large transactions, judged against a median rather than a mean. */
function AnomaliesCard({ anomalies, onSelectMerchant }: AnomaliesCardProps): JSX.Element | null {
  if (anomalies.length === 0) {
    return null;
  }

  return (
    <div className="dashboard__anomalies">
      {anomalies.slice(0, 3).map((anomaly) => (
        <button
          key={anomaly.transaction.id}
          type="button"
          className="card anomaly"
          onClick={() => onSelectMerchant(anomaly.transaction.merchant)}
        >
          <span className="anomaly__badge" aria-hidden="true">
            !
          </span>
          <span className="anomaly__body">
            <span className="anomaly__title">{anomaly.transaction.merchant}</span>
            <span className="anomaly__detail">
              {anomaly.multiple}× the usual {anomaly.baselineLabel} charge of{" "}
              {formatCurrency(anomaly.baselineMedian)} · {formatShortDate(anomaly.transaction.date)}
            </span>
          </span>
          <span className="anomaly__amount tabular">
            {formatCurrency(Math.abs(anomaly.transaction.amount))}
          </span>
        </button>
      ))}
    </div>
  );
}

export default AnomaliesCard;
