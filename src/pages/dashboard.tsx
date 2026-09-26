import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ArrowRight,
  ShieldAlert,
  Plus,
  ArrowDownRight,
  CheckCheck,
  Calculator,
  Download,
  HelpCircle,
  Sliders,
} from "lucide-react";
import { useFinance } from "../components/state";
import {
  Panel,
  Title,
  Money,
  Status,
  LinkArrow,
  Empty,
} from "../components/ui";
import { CashChart, BudgetBar } from "../components/charts";
import { ForecastCard } from "../components/financial/forecast-card";
import { MetricDrillDownModal } from "../components/financial/metric-drill-down-modal";
import { PaymentScheduleCard } from "../components/financial/payment-schedule-card";
import { CollectionsIntelligenceCard } from "../components/financial/collections-intelligence-card";
import { FreshnessBadge } from "../components/financial/freshness-badge";
import { ReconciliationCard } from "../components/financial/reconciliation-card";
import { SecurityEventsCard } from "../components/financial/security-events-card";
import { ExportModal } from "../components/financial/export-modal";
import { TodaysPrioritiesCard } from "../components/platform/todays-priorities-card";
import { WhyNowCard } from "../components/platform/why-now-card";
import { DataHealthCard } from "../components/platform/data-health-card";
import { ExplainNumberModal } from "../components/platform/explain-number-modal";
import { PolicyConfigModal } from "../components/platform/policy-config-modal";
import type { DataLineage } from "../domain/finance/data-lineage";
import { money } from "../domain/money";

export function Dashboard() {
  const { view } = useFinance();
  const m = view.metrics;
  const p = m.projections[1];
  const serious = view.risks.filter((r) =>
    ["HIGH", "CRITICAL"].includes(r.severity),
  );
  const [drillDownCalc, setDrillDownCalc] = useState<DataLineage | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [explainMetric, setExplainMetric] = useState<
    | "PROJECTED_CASH"
    | "CURRENT_CASH"
    | "OUTSTANDING_PAYABLES"
    | "EXPECTED_RECEIVABLES"
    | "BUDGET_UTILIZATION"
    | null
  >(null);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  const cashCalc = m.lineage_kpis?.cash?.lineage?.calculationId
    ? m.calculations?.[m.lineage_kpis.cash.lineage.calculationId]
    : null;
  const payablesCalc = m.lineage_kpis?.payables?.lineage?.calculationId
    ? m.calculations?.[m.lineage_kpis.payables.lineage.calculationId]
    : null;
  const receivablesCalc = m.lineage_kpis?.receivables?.lineage?.calculationId
    ? m.calculations?.[m.lineage_kpis.receivables.lineage.calculationId]
    : null;

  return (
    <>
      <Title
        eyebrow="FINANCIAL CONTROLS & SECURITY"
        title="Financial overview"
        description={`${view.company.name} · ${new Date(m.asOf + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`}
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="secondary"
            >
              <Download size={15} /> Export
            </button>
            <button
              type="button"
              onClick={() => setPolicyModalOpen(true)}
              className="secondary"
            >
              <Sliders size={15} /> Business Rules
            </button>
            {view.actor.role !== "viewer" && (
              <a className="primary" href="/invoices?new=1">
                <Plus size={17} /> Add invoice
              </a>
            )}
          </div>
        }
      />
      <div style={{ marginBottom: "20px" }}>
        <TodaysPrioritiesCard />
      </div>
      <div className="decision-strip">
        <ShieldAlert size={22} />
        <div>
          <strong>
            {view.risk_counts.HIGH + view.risk_counts.CRITICAL} invoices need
            priority review
          </strong>
          <p>
            Review the evidence before approval. Your 30-day outlook includes
            dated outstanding obligations.
          </p>
        </div>
        <a href="/risk">
          Review signals <ArrowRight size={16} />
        </a>
      </div>
      <div className="kpi-grid">
        <section className="cash-kpi">
          <div className="kpi-label flex items-center justify-between">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              Current cash <Wallet size={19} />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setExplainMetric("CURRENT_CASH")}
                title="Explain this number"
                style={{
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  color: "#ffffff",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              >
                <HelpCircle size={12} /> Explain
              </button>
              <FreshnessBadge
                freshness={m.lineage_kpis?.cash?.freshness || m.freshness}
                compact
              />
            </div>
          </div>
          <strong>{money(m.cash)}</strong>
          <div className="cash-caption">
            <span>Cash coverage</span>
            <b>
              {m.coverage === null
                ? "No upcoming payables"
                : m.coverage.toFixed(2) + "×"}
            </b>
          </div>
          {cashCalc && (
            <button
              type="button"
              onClick={() => setDrillDownCalc(cashCalc)}
              className="mt-2 text-xs text-emerald-300 hover:text-emerald-100 hover:underline flex items-center gap-1 font-semibold p-0 bg-transparent border-0"
            >
              <Calculator size={12} />
              View calculation →
            </button>
          )}
        </section>
        <section className="kpi">
          <div className="kpi-label flex items-start justify-between gap-2">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              Outstanding payables <ArrowUpRight size={18} />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setExplainMetric("OUTSTANDING_PAYABLES")}
                title="Explain this number"
                style={{
                  background: "#eff6ff",
                  border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8",
                  borderRadius: "6px",
                  padding: "3px 9px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 2px rgba(37, 99, 235, 0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                <HelpCircle size={12} /> Explain
              </button>
              <FreshnessBadge
                freshness={m.lineage_kpis?.payables?.freshness || m.freshness}
                compact
              />
            </div>
          </div>
          <strong>{money(m.payables)}</strong>
          <span className="kpi-foot">
            <span className="amber-text">{money(m.overdue_payables)}</span>{" "}
            overdue
          </span>
          {payablesCalc && (
            <button
              type="button"
              onClick={() => setDrillDownCalc(payablesCalc)}
              className="mt-2 text-xs text-[#0f766e] hover:text-[#115e59] hover:underline flex items-center gap-1 font-semibold p-0 bg-transparent border-0"
            >
              <Calculator size={12} />
              {payablesCalc.sourceRecords.length} invoices · View calculation →
            </button>
          )}
        </section>
        <section className="kpi">
          <div className="kpi-label flex items-start justify-between gap-2">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              Expected receivables <ArrowDownLeft size={18} />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setExplainMetric("EXPECTED_RECEIVABLES")}
                title="Explain this number"
                style={{
                  background: "#eff6ff",
                  border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8",
                  borderRadius: "6px",
                  padding: "3px 9px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 2px rgba(37, 99, 235, 0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                <HelpCircle size={12} /> Explain
              </button>
              <FreshnessBadge
                freshness={m.lineage_kpis?.receivables?.freshness || m.freshness}
                compact
              />
            </div>
          </div>
          <strong>{money(m.receivables)}</strong>
          <span className="kpi-foot">Across open customer invoices</span>
          {receivablesCalc && (
            <button
              type="button"
              onClick={() => setDrillDownCalc(receivablesCalc)}
              className="mt-2 text-xs text-[#0f766e] hover:text-[#115e59] hover:underline flex items-center gap-1 font-semibold p-0 bg-transparent border-0"
            >
              <Calculator size={12} />
              {receivablesCalc.sourceRecords.length} customer records · View calculation →
            </button>
          )}
        </section>
        <section className="kpi">
          <div className="kpi-label flex items-center justify-between">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              Budget utilization <CheckCheck size={18} />
            </span>
            <button
              type="button"
              onClick={() => setExplainMetric("BUDGET_UTILIZATION")}
              title="Explain this number"
              style={{
                background: "#eff6ff",
                border: "1.5px solid #bfdbfe",
                color: "#1d4ed8",
                borderRadius: "6px",
                padding: "3px 9px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                boxShadow: "0 1px 2px rgba(37, 99, 235, 0.08)",
              }}
            >
              <HelpCircle size={12} /> Explain
            </button>
          </div>
          <strong>
            {m.budget_utilization.toFixed(1)}
            <small>%</small>
          </strong>
          <span className="kpi-foot">Actual + approved commitments</span>
          <a
            href="/budgets"
            className="mt-2 text-xs text-[#0f766e] hover:text-[#115e59] hover:underline flex items-center gap-1 font-semibold"
          >
            Inspect budgets →
          </a>
        </section>
      </div>
      {drillDownCalc && (
        <MetricDrillDownModal
          calculation={drillDownCalc}
          onClose={() => setDrillDownCalc(null)}
        />
      )}
      {m.forecast && <ForecastCard forecast={m.forecast} />}
      {m.payment_schedule && (
        <PaymentScheduleCard scheduleSummary={m.payment_schedule} />
      )}
      {m.receivables_intelligence && (
        <CollectionsIntelligenceCard report={m.receivables_intelligence} />
      )}
      {m.reconciliation && (
        <ReconciliationCard reconciliation={m.reconciliation} />
      )}
      <div style={{ marginBottom: "24px" }}>
        <WhyNowCard />
      </div>
      <div style={{ marginBottom: "24px" }}>
        <DataHealthCard />
      </div>
      <div className="overview-grid">
        <Panel
          title="Cash outlook"
          meta={<LinkArrow href="/cash-flow">View cash flow</LinkArrow>}
        >
          <div className="chart-summary">
            <div>
              <span className="muted">Projected in 30 days</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ margin: 0 }}>{money(p.cash)}</h2>
                <button
                  type="button"
                  onClick={() => setExplainMetric("PROJECTED_CASH")}
                  title="Explain how ₹8.2L is calculated"
                  style={{
                    background: "#eff6ff",
                    border: "1.5px solid #93c5fd",
                    color: "#1d4ed8",
                    borderRadius: "7px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    boxShadow: "0 1px 3px rgba(37, 99, 235, 0.12)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <HelpCircle size={13} /> Explain [?]
                </button>
              </div>
              {m.freshness && (
                <div style={{ marginTop: "4px" }}>
                  <FreshnessBadge
                    freshness={m.freshness}
                    compact
                  />
                </div>
              )}
            </div>
            <span className={"trend " + (p.cash < m.cash ? "down" : "up")}>
              {p.cash < m.cash ? (
                <ArrowDownRight size={16} />
              ) : (
                <ArrowUpRight size={16} />
              )}{" "}
              {money(Math.abs(p.cash - m.cash))}{" "}
              {p.cash < m.cash ? "decrease" : "increase"}
            </span>
          </div>
          <CashChart points={m.projections} />
          <div className="cash-bridge">
            <div>
              <span>Current cash</span>
              <strong>{money(m.cash)}</strong>
            </div>
            <div>
              <span>Expected inflow</span>
              <strong className="inflow">+ {money(p.inflow)}</strong>
            </div>
            <div>
              <span>Expected outflow</span>
              <strong className="outflow">− {money(p.outflow)}</strong>
            </div>
          </div>
          <div className="chart-legend">
            <span>
              <i className="dot teal" />
              Dated cash projection
            </span>
            <span>Assumes collection and payment on due dates</span>
          </div>
        </Panel>
        <Panel
          title="Needs your attention"
          meta={<span className="count-pill">{serious.length}</span>}
          className="attention-panel"
        >
          <p className="panel-intro">
            Prioritize the signals that need a closer look.
          </p>
          {serious.slice(0, 3).map((r) => (
            <a
              className="attention-row"
              key={r.invoice_id}
              href={"/invoices/" + r.invoice_id}
            >
              <span className="risk-icon">
                <ShieldAlert size={18} />
              </span>
              <div>
                <strong>
                  {
                    r.signals.find(
                      (s) => s.severity === "HIGH" || s.severity === "CRITICAL",
                    )?.title
                  }
                </strong>
                <p>
                  {view.invoices.find((i) => i.id === r.invoice_id)
                    ?.invoice_number || r.invoice_id}
                </p>
                <small>{r.signals.length} signals · Evidence available</small>
              </div>
              <ArrowUpRight size={17} />
            </a>
          ))}
          {!serious.length && <Empty text="No high-priority signals." />}
          <a className="panel-bottom-link" href="/risk">
            Open risk center <ArrowRight size={16} />
          </a>
        </Panel>
      </div>
      <div className="overview-grid lower">
        <Panel
          title="Budget overview"
          meta={<LinkArrow href="/budgets">Manage budgets</LinkArrow>}
        >
          <div className="budget-legend">
            <span>
              <i className="dot teal" /> Actual
            </span>
            <span>
              <i className="dot light-teal" /> Committed
            </span>
            <span>
              <i className="dot gray" /> Remaining
            </span>
          </div>
          {m.budgets
            .filter((b) => b.period_start <= m.asOf && b.period_end >= m.asOf)
            .map((b) => (
              <div className="budget-overview" key={b.id}>
                <div>
                  <strong>{b.name}</strong>
                  <span>
                    {money(b.actual + b.committed)}{" "}
                    <small>/ {money(b.budget_minor)}</small>
                  </span>
                </div>
                <BudgetBar
                  actual={b.actual}
                  committed={b.committed}
                  budget={b.budget_minor}
                />
                <div className="budget-meta">
                  <span>{money(b.remaining)} remaining</span>
                  <b>{b.utilization.toFixed(0)}%</b>
                </div>
              </div>
            ))}
        </Panel>
        <Panel
          title="Recommended actions"
          meta={<span className="muted">Rule-based</span>}
        >
          {view.recommendations
            .filter((r) => !["DISMISSED", "COMPLETED"].includes(r.status))
            .slice(0, 3)
            .map((r, k) => (
              <a className="recommendation-row" href="/risk" key={r.id}>
                <span className="step-number">0{k + 1}</span>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.reason}</p>
                </div>
                <ArrowUpRight size={17} />
              </a>
            ))}
          {!view.recommendations.length && (
            <Empty text="No recommendations at this time." />
          )}
        </Panel>
      </div>
      <Panel
        title="Upcoming obligations"
        meta={<LinkArrow href="/invoices">All invoices</LinkArrow>}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vendor</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="num">Outstanding</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.source_invoices.slice(0, 5).map((i) => {
                const inv = { vendor_id: i.vendor_id, status: i.status };
                return (
                  <tr key={i.id}>
                    <td>
                      <a className="record-link" href={"/invoices/" + i.id}>
                        {i.reference}
                      </a>
                    </td>
                    <td>
                      {view.vendors.find((v) => v.id === inv?.vendor_id)
                        ?.name || "View record"}
                    </td>
                    <td>{i.due_date}</td>
                    <td>
                      <Status value={inv?.status || "APPROVED"} />
                    </td>
                    <td className="num">
                      <Money value={i.amount} />
                    </td>
                    <td>
                      <a
                        aria-label={"View " + i.reference}
                        href={"/invoices/" + i.id}
                      >
                        <ArrowUpRight size={16} />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!p.source_invoices.length && (
            <Empty text="No upcoming obligations." />
          )}
        </div>
      </Panel>
      {["admin", "finance"].includes(view.actor.role) && <SecurityEventsCard />}
      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
      <ExplainNumberModal
        metricKey={explainMetric || "PROJECTED_CASH"}
        isOpen={!!explainMetric}
        onClose={() => setExplainMetric(null)}
      />
      <PolicyConfigModal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        isAdmin={view.actor.role === "admin"}
      />
    </>
  );
}
