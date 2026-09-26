import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, ShieldAlert, ArrowRight, X, Info } from "lucide-react";
import { Money, Status } from "../ui";
import type { ScenarioResult } from "../../server/financial/scenario-simulator";

export function formatCompactRupees(amountInRupees: number): string {
  const abs = Math.abs(amountInRupees);
  if (abs >= 1e7) {
    const cr = amountInRupees / 1e7;
    return `₹${cr.toFixed(1)}Cr`;
  }
  if (abs >= 1e5) {
    const l = amountInRupees / 1e5;
    return `₹${l.toFixed(1)}L`;
  }
  if (abs >= 1e3) {
    return `₹${(amountInRupees / 1e3).toFixed(1)}k`;
  }
  return `₹${Math.round(amountInRupees).toLocaleString("en-IN")}`;
}

interface ImpactBeforeApprovalProps {
  invoice: {
    id: string;
    invoice_number: string;
    vendor_name: string;
    total_minor: number;
    outstanding_minor: number;
    category_name?: string;
    status: string;
  };
  reason: string;
  onReasonChange: (val: string) => void;
  onSimulate: () => Promise<ScenarioResult>;
  onApprove: () => void;
  onInvestigate: () => void;
  onClose: () => void;
  busy?: boolean;
}

export function ImpactBeforeApprovalModal({
  invoice,
  reason,
  onReasonChange,
  onSimulate,
  onApprove,
  onInvestigate,
  onClose,
  busy,
}: ImpactBeforeApprovalProps) {
  const [loading, setLoading] = useState(true);
  const [simulation, setSimulation] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState("");

  const outstandingRupees = invoice.outstanding_minor / 100;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    onSimulate()
      .then((res) => {
        if (mounted) setSimulation(res);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "Failed to simulate approval impact.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [invoice.id]);

  const cashBefore = simulation?.impact.cash.before ?? 0;
  const cashAfterPayment =
    simulation?.impact.cash.postPaymentCash ??
    Math.max(0, cashBefore - outstandingRupees);

  const coverageBefore = simulation?.impact.cashCoverage.before ?? 0;
  const coverageAfterPayment =
    simulation?.impact.cashCoverage.postPaymentCoverage ??
    simulation?.impact.cashCoverage.after ??
    0;

  const budget = simulation?.impact.budget;
  const beforeUtil = budget?.beforeUtilization ?? 0;
  const afterUtil = budget?.afterUtilization ?? 0;

  // Determine overall severity
  const highestRisk = simulation?.impact.risks.find((r) => r.level === "HIGH")
    ? "HIGH"
    : simulation?.impact.risks.find((r) => r.level === "MEDIUM")
      ? "MEDIUM"
      : "LOW";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="impact-title">
      <div className="modal-card impact-modal-card">
        {/* Header matching requested: Approve Invoice ₹2.4L */}
        <div className="impact-header">
          <div>
            <span className="impact-eyebrow">IMPACT BEFORE APPROVAL</span>
            <h3 id="impact-title">
              Approve Invoice {formatCompactRupees(outstandingRupees)}
            </h3>
            <p className="impact-subtitle">
              {invoice.vendor_name} · {invoice.invoice_number}
              {invoice.category_name && ` · ${invoice.category_name}`}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="impact-loading" role="status">
            <div className="spinner" />
            <span>Calculating cash & budget impact from verified ledger…</span>
          </div>
        ) : (
          <div className="impact-body">
            {/* Cash Impact Section */}
            <div className="impact-section">
              <div className="impact-section-header">
                <span className="section-label">Cash Impact</span>
                <span className="section-formula">
                  {formatCompactRupees(cashBefore)} → {formatCompactRupees(cashAfterPayment)}
                </span>
              </div>
              <div className="impact-metric-row">
                <div className="metric-box">
                  <span className="metric-tag">Current Cash</span>
                  <strong className="metric-value">{formatCompactRupees(cashBefore)}</strong>
                  <small className="metric-sub">
                    <Money value={cashBefore * 100} />
                  </small>
                </div>
                <div className="metric-arrow">
                  <ArrowRight size={20} />
                  <span className="delta-tag negative">
                    −{formatCompactRupees(outstandingRupees)}
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-tag">Post-Settlement Cash</span>
                  <strong className="metric-value">
                    {formatCompactRupees(cashAfterPayment)}
                  </strong>
                  <small className="metric-sub">
                    <Money value={cashAfterPayment * 100} />
                  </small>
                </div>
              </div>

              {/* Coverage comparison */}
              <div className="coverage-bar">
                <span>Cash coverage:</span>
                <strong>
                  {coverageBefore ? `${coverageBefore.toFixed(2)}×` : "N/A"} →{" "}
                  {coverageAfterPayment ? `${coverageAfterPayment.toFixed(2)}×` : "N/A"}
                </strong>
                <small className="coverage-hint">
                  {coverageAfterPayment < 1.0
                    ? "⚠ Deficit risk: obligations exceed cash"
                    : coverageAfterPayment < 1.5
                      ? "Coverage tightens under near-term obligations"
                      : "Sufficient liquidity buffer maintained"}
                </small>
              </div>
            </div>

            {/* Budget Impact Section */}
            {budget && (
              <div className="impact-section">
                <div className="impact-section-header">
                  <span className="section-label">Budget Impact</span>
                  <span className="section-formula">
                    {Math.round(beforeUtil)}% → {Math.round(afterUtil)}%
                  </span>
                </div>
                <div className="budget-progress-container">
                  <div className="budget-bars">
                    <div className="bar-label">
                      <span>Before approval: {Math.round(beforeUtil)}%</span>
                      <span>Remaining: <Money value={budget.beforeRemaining * 100} /></span>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${beforeUtil >= 90 ? "danger" : "normal"}`}
                        style={{ width: `${Math.min(100, Math.max(0, beforeUtil))}%` }}
                      />
                    </div>

                    <div className="bar-label mt-2">
                      <span>After approval: {Math.round(afterUtil)}%</span>
                      <span>
                        Remaining:{" "}
                        <Money
                          value={Math.max(0, budget.afterRemaining) * 100}
                        />
                        {budget.afterRemaining < 0 && (
                          <span className="overage-tag">
                            {" "}(Exceeded by <Money value={Math.abs(budget.afterRemaining) * 100} />)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${
                          afterUtil >= 100 ? "danger" : afterUtil >= 90 ? "warning" : "normal"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, afterUtil))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Risk Section */}
            <div className={`impact-section risk-section ${highestRisk.toLowerCase()}`}>
              <div className="impact-section-header">
                <span className="section-label">Risk Assessment</span>
                <span className={`risk-badge ${highestRisk.toLowerCase()}`}>
                  {highestRisk === "HIGH" && <AlertTriangle size={15} />}
                  {highestRisk === "MEDIUM" && <ShieldAlert size={15} />}
                  {highestRisk === "LOW" && <CheckCircle size={15} />}
                  {highestRisk}
                </span>
              </div>

              {simulation?.impact.risks && simulation.impact.risks.length > 0 ? (
                <ul className="risk-reasons-list">
                  {simulation.impact.risks.map((r, idx) => (
                    <li key={idx} className={r.level.toLowerCase()}>
                      <span className="bullet">⚠</span>
                      <span>{r.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-risks-text">
                  ✓ No critical cash or budget limit breaches identified.
                </p>
              )}
            </div>

            {/* Review Reason confirmation */}
            <div className="impact-reason-box">
              <label htmlFor="modal-reason-input">
                <strong>Review verification note:</strong>
              </label>
              <textarea
                id="modal-reason-input"
                rows={2}
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Document what was verified prior to approval..."
              />
            </div>

            <div className="impact-disclaimer">
              <Info size={14} />
              <span>
                Simulation reads verified ledger data and does not alter ledger state until approval is confirmed.
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons as requested: [Investigate] [Approve] */}
        <div className="impact-actions-footer">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <div className="decision-actions-right">
            <button
              type="button"
              className="warning-btn"
              disabled={busy || !reason.trim()}
              onClick={onInvestigate}
              title="Flag invoice for deeper investigation"
            >
              Investigate
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !reason.trim()}
              onClick={onApprove}
            >
              Approve {formatCompactRupees(outstandingRupees)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
