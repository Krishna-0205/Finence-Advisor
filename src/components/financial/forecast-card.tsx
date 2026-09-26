import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Calculator,
  SlidersHorizontal,
  ArrowRight,
  Database,
  FileText,
} from "lucide-react";
import type { MultiScenarioForecastResult, ScenarioResult } from "../../server/finance/scenario-forecast-engine";
import type { ForecastScenario } from "../../domain/finance/forecast-scenario";
import { money } from "../../domain/money";
import { FreshnessBadge } from "./freshness-badge";

export interface ForecastCardProps {
  forecast: MultiScenarioForecastResult;
  className?: string;
  onSelectScenario?: (s: ForecastScenario) => void;
}

export function ForecastCard({ forecast, className = "", onSelectScenario }: ForecastCardProps) {
  const [selectedScenario, setSelectedScenario] = useState<ForecastScenario>("BASE");
  const [showEvidence, setShowEvidence] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [showImpacts, setShowImpacts] = useState(false);

  const scenarioData: ScenarioResult = forecast.scenarios[selectedScenario];
  const conf = forecast.confidence;

  const currentCashMinor = forecast.currentCash.minor;
  const projectedCashMinor = scenarioData.projectedCash.minor;
  const cashDeltaMinor = projectedCashMinor - currentCashMinor;
  const isPositiveDelta = cashDeltaMinor >= 0;

  const confLevelColor =
    conf.level === "HIGH"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : conf.level === "MEDIUM"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-rose-700 bg-rose-50 border-rose-200";

  function handleSelectScenario(sc: ForecastScenario) {
    setSelectedScenario(sc);
    onSelectScenario?.(sc);
  }

  return (
    <div className={`forecast-card ${className}`}>
      {/* Top Banner: Forecast Overview & Auditable Confidence */}
      <div className="forecast-card-header">
        <div className="forecast-title-group">
          <div className="forecast-eyebrow">
            <Layers size={14} className="text-teal-700" />
            <span>DETERMINISTIC FORECAST & SCENARIOS</span>
            <span className="bullet">·</span>
            <span>{forecast.horizonDays}-DAY HORIZON (THROUGH {forecast.horizonDate})</span>
          </div>
          <h2 className="forecast-title">Cash Flow Forecast</h2>
        </div>

        {/* Auditable Confidence & Data Freshness Indicator */}
        <div className="confidence-indicator-group flex items-center gap-2">
          {forecast.freshness && (
            <FreshnessBadge freshness={forecast.freshness} compact />
          )}
          <button
            type="button"
            className={`confidence-badge ${confLevelColor}`}
            onClick={() => setShowEvidence((v) => !v)}
            title="Click to view auditable confidence evidence"
            aria-expanded={showEvidence}
          >
            {conf.level === "HIGH" ? (
              <ShieldCheck size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span className="font-semibold">{conf.level} CONFIDENCE</span>
            <span className="score-sep">|</span>
            <span className="score-num">{conf.score}/100</span>
            {showEvidence ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable Confidence Evidence & Policy Audit */}
      {showEvidence && (
        <div className="confidence-evidence-panel">
          <div className="evidence-header">
            <strong>Auditable Confidence Evidence & Signals</strong>
            <span className="text-xs text-slate-500">
              Objective product policy evaluation (0–100)
            </span>
          </div>
          <div className="evidence-grid">
            <div className="evidence-item">
              <span className="evidence-label">Historical Depth</span>
              <strong className="evidence-val">
                {conf.evidence.historicalMonths} months
              </strong>
              <small className="evidence-sub">
                {conf.evidence.historicalMonths >= 6 ? "Strong ledger depth" : "Limited history"}
              </small>
            </div>
            <div className="evidence-item">
              <span className="evidence-label">Upcoming Obligations</span>
              <strong className="evidence-val">
                {conf.evidence.upcomingPayables} payables
              </strong>
              <small className="evidence-sub">In-horizon commitments</small>
            </div>
            <div className="evidence-item">
              <span className="evidence-label">Upcoming Collections</span>
              <strong className="evidence-val">
                {conf.evidence.upcomingReceivables} receivables
              </strong>
              <small className="evidence-sub">Open customer invoices</small>
            </div>
            <div className="evidence-item">
              <span className="evidence-label">Overdue Ratio</span>
              <strong className="evidence-val">
                {conf.evidence.overdueReceivables} overdue
              </strong>
              <small className="evidence-sub">
                {conf.evidence.upcomingReceivables > 0
                  ? `${Math.round((conf.evidence.overdueReceivables / conf.evidence.upcomingReceivables) * 100)}% of open receivables`
                  : "None overdue"}
              </small>
            </div>
            {conf.evidence.historicalCollectionReliability !== undefined && (
              <div className="evidence-item">
                <span className="evidence-label">Collection Reliability</span>
                <strong className="evidence-val">
                  {Math.round(conf.evidence.historicalCollectionReliability * 100)}%
                </strong>
                <small className="evidence-sub">Realized receipt rate</small>
              </div>
            )}
            {conf.evidence.historicalPaymentReliability !== undefined && (
              <div className="evidence-item">
                <span className="evidence-label">Payment Reliability</span>
                <strong className="evidence-val">
                  {Math.round(conf.evidence.historicalPaymentReliability * 100)}%
                </strong>
                <small className="evidence-sub">Timely payment record</small>
              </div>
            )}
          </div>
          <div className="evidence-reasons">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Evaluation Factors:
            </span>
            <ul className="reasons-list">
              {conf.reasons.map((r, i) => (
                <li key={i}>
                  <Info size={13} className="text-teal-600 inline mr-1 flex-shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Scenario Switcher Tabs */}
      <div className="scenario-tabs-strip">
        <button
          type="button"
          className={`scenario-tab ${selectedScenario === "BASE" ? "active" : ""}`}
          onClick={() => handleSelectScenario("BASE")}
        >
          <span className="tab-name">Base Case</span>
          <span className="tab-cash">{money(forecast.scenarios.BASE.projectedCash.minor)}</span>
        </button>

        <button
          type="button"
          className={`scenario-tab ${selectedScenario === "CONSERVATIVE" ? "active" : ""}`}
          onClick={() => handleSelectScenario("CONSERVATIVE")}
        >
          <span className="tab-name">Conservative Stress Test</span>
          <span className="tab-cash">{money(forecast.scenarios.CONSERVATIVE.projectedCash.minor)}</span>
        </button>

        <button
          type="button"
          className={`scenario-tab ${selectedScenario === "OPTIMISTIC" ? "active" : ""}`}
          onClick={() => handleSelectScenario("OPTIMISTIC")}
        >
          <span className="tab-name">Optimistic Liquidity</span>
          <span className="tab-cash">{money(forecast.scenarios.OPTIMISTIC.projectedCash.minor)}</span>
        </button>
      </div>

      {/* Active Scenario Display */}
      <div className="scenario-details-box">
        <div className="scenario-main-kpi">
          <div className="kpi-block">
            <span className="kpi-label">Projected Cash ({forecast.horizonDays}d)</span>
            <div className="kpi-val-row">
              <span className="kpi-val">{money(projectedCashMinor)}</span>
              <span className={`kpi-trend ${isPositiveDelta ? "trend-up" : "trend-down"}`}>
                {isPositiveDelta ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                <span>
                  {isPositiveDelta ? "+" : "−"} {money(Math.abs(cashDeltaMinor))}{" "}
                  ({isPositiveDelta ? "increase" : "drawdown"})
                </span>
              </span>
            </div>
            <span className="kpi-caption">
              From current cash {money(currentCashMinor)} based on {selectedScenario.toLowerCase()} scenario assumptions.
            </span>
          </div>

          <div className="scenario-bridge-grid">
            <div className="bridge-cell">
              <span className="bridge-label">Current Cash</span>
              <strong className="bridge-val">{money(currentCashMinor)}</strong>
            </div>
            <div className="bridge-cell">
              <span className="bridge-label">Expected Inflow</span>
              <strong className="bridge-val text-emerald-700">
                + {money(scenarioData.inflow.minor)}
              </strong>
            </div>
            <div className="bridge-cell">
              <span className="bridge-label">Expected Outflow</span>
              <strong className="bridge-val text-rose-700">
                − {money(scenarioData.outflow.minor)}
              </strong>
            </div>
            <div className="bridge-cell">
              <span className="bridge-label">Net Horizon Flow</span>
              <strong className={`bridge-val ${scenarioData.netChange.minor >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {scenarioData.netChange.minor >= 0 ? "+" : "−"} {money(Math.abs(scenarioData.netChange.minor))}
              </strong>
            </div>
          </div>
        </div>

        {/* Explicit Scenario Assumptions Bar */}
        <div className="scenario-assumptions-banner">
          <SlidersHorizontal size={15} className="text-teal-700 flex-shrink-0 mt-0.5" />
          <div className="assumptions-content">
            <strong>{scenarioData.description}</strong>
            <div className="assumptions-tags">
              {scenarioData.assumptions.receivableDelayDays > 0 ? (
                <span className="assumption-pill">
                  Receivables delayed {scenarioData.assumptions.receivableDelayDays} days
                </span>
              ) : (
                <span className="assumption-pill">Contractual collections on schedule</span>
              )}

              {scenarioData.assumptions.payableTimingDays < 0 ? (
                <span className="assumption-pill">
                  Payables accelerated {Math.abs(scenarioData.assumptions.payableTimingDays)} days
                </span>
              ) : scenarioData.assumptions.payableTimingDays > 0 ? (
                <span className="assumption-pill">
                  Payables deferred {scenarioData.assumptions.payableTimingDays} days
                </span>
              ) : (
                <span className="assumption-pill">Contractual payment dates</span>
              )}

              {scenarioData.assumptions.discretionaryExpenseAdjustment !== 0 && (
                <span className="assumption-pill">
                  Discretionary expenses {scenarioData.assumptions.discretionaryExpenseAdjustment > 0 ? "+10%" : "−10%"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Affected Transactions Toggle */}
        {scenarioData.impacts.length > 0 && (
          <div className="scenario-impacts-accordion">
            <button
              type="button"
              className="impacts-toggle-btn"
              onClick={() => setShowImpacts((v) => !v)}
              aria-expanded={showImpacts}
            >
              <FileText size={15} />
              <span>
                View {scenarioData.impacts.length} underlying obligations & timing impacts
              </span>
              {showImpacts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showImpacts && (
              <div className="impacts-table-wrap">
                <table className="impacts-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Original Date</th>
                      <th>Adjusted Date</th>
                      <th className="num">Original</th>
                      <th className="num">Adjusted</th>
                      <th>In Horizon?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioData.impacts.map((imp) => (
                      <tr key={imp.id}>
                        <td>
                          <span className={`type-tag ${imp.type === "RECEIVABLE" ? "rec" : "pay"}`}>
                            {imp.type === "RECEIVABLE" ? "Inflow" : "Outflow"}
                          </span>
                        </td>
                        <td><strong>{imp.reference}</strong></td>
                        <td>{imp.originalDate}</td>
                        <td>
                          {imp.adjustedDate !== imp.originalDate ? (
                            <span className="text-amber-800 font-medium">
                              {imp.adjustedDate}
                            </span>
                          ) : (
                            imp.adjustedDate
                          )}
                        </td>
                        <td className="num">{money(imp.originalAmountMinor)}</td>
                        <td className="num">
                          {imp.adjustedAmountMinor !== imp.originalAmountMinor ? (
                            <span className="font-semibold text-teal-800">
                              {money(imp.adjustedAmountMinor)}
                            </span>
                          ) : (
                            money(imp.adjustedAmountMinor)
                          )}
                        </td>
                        <td>
                          {imp.includedInHorizon ? (
                            <span className="text-xs text-emerald-700 font-medium">Included</span>
                          ) : (
                            <span className="text-xs text-rose-600 font-medium">Shifted outside</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* "How this forecast is calculated" Expandable Audit & Lineage */}
      <div className="forecast-lineage-container">
        <button
          type="button"
          className="lineage-toggle-btn"
          onClick={() => setShowFormula((v) => !v)}
          aria-expanded={showFormula}
        >
          <Calculator size={16} className="text-teal-700" />
          <span className="font-semibold text-slate-800">
            How this forecast is calculated (Audit & Data Lineage)
          </span>
          {showFormula ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showFormula && (
          <div className="lineage-drawer">
            {/* Mathematical Formula */}
            <div className="formula-box">
              <span className="formula-label">Exact Arithmetic Formula:</span>
              <code className="formula-code">
                Projected Cash = Current Cash + In-Horizon Inflows − In-Horizon Outflows
              </code>
              <div className="formula-calculation">
                <span className="calc-row">
                  {money(currentCashMinor)} (Current) + {money(scenarioData.inflow.minor)} (Inflows) − {money(scenarioData.outflow.minor)} (Outflows) ={" "}
                  <strong>{money(projectedCashMinor)}</strong>
                </span>
              </div>
            </div>

            {/* Traceability to Source Records */}
            <div className="lineage-metadata-grid">
              <div className="lineage-meta-item">
                <Database size={15} className="text-slate-500" />
                <div>
                  <strong>Source Ledger Records</strong>
                  <span>{forecast.lineage.sourceRecordCount} transactions reconciled</span>
                </div>
              </div>

              <div className="lineage-meta-item">
                <FileText size={15} className="text-slate-500" />
                <div>
                  <strong>Approved Payables</strong>
                  <span>{forecast.lineage.payablesCount} obligations analyzed</span>
                </div>
              </div>

              <div className="lineage-meta-item">
                <FileText size={15} className="text-slate-500" />
                <div>
                  <strong>Open Receivables</strong>
                  <span>{forecast.lineage.receivablesCount} expected receipts</span>
                </div>
              </div>
            </div>

            {/* Production Rule / Audit Notice */}
            <div className="audit-rule-notice">
              <Info size={14} className="text-slate-600 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Audit Guarantee:</strong> The Financial Engine calculates all forecast and confidence figures using deterministic integer paise arithmetic. AI may interpret qualitative impacts, but is strictly prohibited from inventing forecast figures or confidence levels.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
