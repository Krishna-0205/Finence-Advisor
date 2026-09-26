import { useState } from "react";
import {
  Briefcase,
  Building,
  Landmark,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Layers,
} from "lucide-react";
import { Money, Panel } from "../ui";
import type { Metrics } from "../../server/finance";

interface CashFlowStatementProps {
  metrics: Metrics;
}

export function CashFlowStatement({ metrics }: CashFlowStatementProps) {
  const [horizon, setHorizon] = useState<"actual" | 30 | 60 | 90>("actual");
  const [expandedSection, setExpandedSection] = useState<{
    operating: boolean;
    investing: boolean;
    financing: boolean;
  }>({
    operating: true,
    investing: false,
    financing: false,
  });

  const statement = metrics.cash_flow_statement;
  const projection =
    horizon === "actual"
      ? null
      : metrics.projections.find((p) => p.days === horizon);

  // Compute values based on selected horizon
  const isActual = horizon === "actual";

  const customerCollections = isActual
    ? statement?.operating.customer_collections_minor ?? 0
    : projection?.ias7?.operating.customer_collections_minor ??
      projection?.inflow ??
      0;

  const supplierPayments = isActual
    ? statement?.operating.supplier_payments_minor ?? 0
    : projection?.ias7?.operating.supplier_payments_minor ??
      projection?.outflow ??
      0;

  const operatingExpenses = isActual
    ? statement?.operating.operating_expenses_minor ?? 0
    : projection?.ias7?.operating.operating_expenses_minor ?? 0;

  const netOperating =
    customerCollections - supplierPayments - operatingExpenses;

  const assetPurchases = isActual
    ? statement?.investing.asset_purchases_minor ?? 0
    : projection?.ias7?.investing.asset_purchases_minor ?? 0;

  const assetSales = isActual
    ? statement?.investing.asset_sales_minor ?? 0
    : projection?.ias7?.investing.asset_sales_minor ?? 0;

  const netInvesting = assetSales - assetPurchases;

  const loansReceived = isActual
    ? statement?.financing.loans_received_minor ?? 0
    : projection?.ias7?.financing.loans_received_minor ?? 0;

  const loanRepayments = isActual
    ? statement?.financing.loan_repayments_minor ?? 0
    : projection?.ias7?.financing.loan_repayments_minor ?? 0;

  const equityTransactions = isActual
    ? statement?.financing.equity_transactions_minor ?? 0
    : projection?.ias7?.financing.equity_transactions_minor ?? 0;

  const netFinancing = loansReceived + equityTransactions - loanRepayments;

  const netChange = netOperating + netInvesting + netFinancing;

  const openingCash = isActual
    ? statement?.opening_cash_minor ?? metrics.cash
    : metrics.cash;

  const closingCash = openingCash + netChange;

  return (
    <Panel
      title="IAS 7 Statement of Cash Flows"
      meta={
        <div className="horizon-pills" role="tablist" aria-label="Statement timeline">
          <button
            type="button"
            className={`horizon-pill ${horizon === "actual" ? "active" : ""}`}
            onClick={() => setHorizon("actual")}
          >
            Realized to date
          </button>
          <button
            type="button"
            className={`horizon-pill ${horizon === 30 ? "active" : ""}`}
            onClick={() => setHorizon(30)}
          >
            Next 30 days
          </button>
          <button
            type="button"
            className={`horizon-pill ${horizon === 60 ? "active" : ""}`}
            onClick={() => setHorizon(60)}
          >
            Next 60 days
          </button>
          <button
            type="button"
            className={`horizon-pill ${horizon === 90 ? "active" : ""}`}
            onClick={() => setHorizon(90)}
          >
            Next 90 days
          </button>
        </div>
      }
    >
      <div className="ias7-container">
        {/* Accounting Standard Explanatory Tag */}
        <div className="ias7-intro">
          <div className="ias7-badge-row">
            <span className="ias7-badge">IAS 7 COMPLIANT STRUCTURE</span>
            <span className="ias7-subtext">
              {isActual
                ? "Classified historical transactions from the verified ledger"
                : `Projected semantic cash movements over the next ${horizon} days`}
            </span>
          </div>
          <p className="ias7-summary-note">
            Classifies cash movements into Operating, Investing, and Financing activities.
            Provides structural visibility into core operational self-sufficiency versus capital allocations.
          </p>
        </div>

        {/* Tree Presentation */}
        <div className="ias7-tree">
          {/* Section 1: Operating Activities */}
          <div className="ias7-node">
            <div
              className="ias7-node-header operating"
              onClick={() =>
                setExpandedSection((s) => ({
                  ...s,
                  operating: !s.operating,
                }))
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setExpandedSection((s) => ({ ...s, operating: !s.operating }));
                }
              }}
            >
              <div className="ias7-header-left">
                {expandedSection.operating ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <Briefcase size={16} className="ias7-icon op" />
                <span className="ias7-node-title">Operating Activities</span>
                <span className="ias7-node-desc">
                  (Customer receipts, trade supplier payments & operating overhead)
                </span>
              </div>
              <div className="ias7-header-right">
                <span className="ias7-net-label">Net Operating:</span>
                <strong
                  className={`ias7-net-amount ${netOperating >= 0 ? "positive" : "negative"}`}
                >
                  <Money value={netOperating} />
                </strong>
              </div>
            </div>

            {expandedSection.operating && (
              <div className="ias7-node-children">
                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">├──</span>
                    <span className="ias7-line-name">Customer collections</span>
                    <small className="ias7-line-hint">
                      {isActual
                        ? "Cash received from sales & trade receivables"
                        : `Receivables scheduled for collection in ${horizon}d`}
                    </small>
                  </div>
                  <div className="ias7-line-right positive">
                    +<Money value={customerCollections} />
                  </div>
                </div>

                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">├──</span>
                    <span className="ias7-line-name">Supplier payments</span>
                    <small className="ias7-line-hint">
                      Payments to core vendors, technology & logistics suppliers
                    </small>
                  </div>
                  <div className="ias7-line-right negative">
                    −<Money value={supplierPayments} />
                  </div>
                </div>

                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">└──</span>
                    <span className="ias7-line-name">Operating expenses</span>
                    <small className="ias7-line-hint">
                      Facilities, office renewal, utilities & administrative expenses
                    </small>
                  </div>
                  <div className="ias7-line-right negative">
                    −<Money value={operatingExpenses} />
                  </div>
                </div>

                {isActual && statement?.operating.items && statement.operating.items.length > 0 && (
                  <div className="ias7-subledger">
                    <span className="subledger-header">Realized Line Items ({statement.operating.items.length})</span>
                    <div className="subledger-list">
                      {statement.operating.items.map((item) => (
                        <div key={item.id} className="subledger-row">
                          <span className="subledger-date">{item.date}</span>
                          <span className="subledger-title">{item.title}</span>
                          <span className="subledger-ref">{item.reference || "—"}</span>
                          <span
                            className={`subledger-amount ${item.amount_minor >= 0 ? "positive" : "negative"}`}
                          >
                            <Money value={item.amount_minor} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Investing Activities */}
          <div className="ias7-node">
            <div
              className="ias7-node-header investing"
              onClick={() =>
                setExpandedSection((s) => ({
                  ...s,
                  investing: !s.investing,
                }))
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setExpandedSection((s) => ({ ...s, investing: !s.investing }));
                }
              }}
            >
              <div className="ias7-header-left">
                {expandedSection.investing ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <Building size={16} className="ias7-icon inv" />
                <span className="ias7-node-title">Investing Activities</span>
                <span className="ias7-tag-extensible">Extensible</span>
                <span className="ias7-node-desc">
                  (Capital expenditures, equipment & asset disposals)
                </span>
              </div>
              <div className="ias7-header-right">
                <span className="ias7-net-label">Net Investing:</span>
                <strong className="ias7-net-amount">
                  <Money value={netInvesting} />
                </strong>
              </div>
            </div>

            {expandedSection.investing && (
              <div className="ias7-node-children">
                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">├──</span>
                    <span className="ias7-line-name">Asset purchases (Capex)</span>
                    <small className="ias7-line-hint">
                      Acquisition of machinery, server equipment, hardware & property
                    </small>
                  </div>
                  <div className="ias7-line-right">
                    {assetPurchases ? (
                      <span className="negative">−<Money value={assetPurchases} /></span>
                    ) : (
                      <span className="zero-val">₹0.00</span>
                    )}
                  </div>
                </div>

                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">└──</span>
                    <span className="ias7-line-name">Asset sales</span>
                    <small className="ias7-line-hint">
                      Proceeds from disposal of fixed assets or capital investments
                    </small>
                  </div>
                  <div className="ias7-line-right">
                    {assetSales ? (
                      <span className="positive">+<Money value={assetSales} /></span>
                    ) : (
                      <span className="zero-val">₹0.00</span>
                    )}
                  </div>
                </div>

                <div className="ias7-extensible-note">
                  <Info size={14} />
                  <span>
                    Investing cash flow records capital asset movements. Invoices or payments tagged under Capital Asset or Capex are automatically classified here.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Financing Activities */}
          <div className="ias7-node">
            <div
              className="ias7-node-header financing"
              onClick={() =>
                setExpandedSection((s) => ({
                  ...s,
                  financing: !s.financing,
                }))
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setExpandedSection((s) => ({ ...s, financing: !s.financing }));
                }
              }}
            >
              <div className="ias7-header-left">
                {expandedSection.financing ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <Landmark size={16} className="ias7-icon fin" />
                <span className="ias7-node-title">Financing Activities</span>
                <span className="ias7-tag-extensible">Extensible</span>
                <span className="ias7-node-desc">
                  (Debt borrowings, principal repayments & equity transactions)
                </span>
              </div>
              <div className="ias7-header-right">
                <span className="ias7-net-label">Net Financing:</span>
                <strong className="ias7-net-amount">
                  <Money value={netFinancing} />
                </strong>
              </div>
            </div>

            {expandedSection.financing && (
              <div className="ias7-node-children">
                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">├──</span>
                    <span className="ias7-line-name">Loans received</span>
                    <small className="ias7-line-hint">
                      Proceeds from long-term or short-term borrowings & credit lines
                    </small>
                  </div>
                  <div className="ias7-line-right">
                    {loansReceived ? (
                      <span className="positive">+<Money value={loansReceived} /></span>
                    ) : (
                      <span className="zero-val">₹0.00</span>
                    )}
                  </div>
                </div>

                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">├──</span>
                    <span className="ias7-line-name">Loan repayments</span>
                    <small className="ias7-line-hint">
                      Principal repayment of borrowings & credit debt
                    </small>
                  </div>
                  <div className="ias7-line-right">
                    {loanRepayments ? (
                      <span className="negative">−<Money value={loanRepayments} /></span>
                    ) : (
                      <span className="zero-val">₹0.00</span>
                    )}
                  </div>
                </div>

                <div className="ias7-line-item">
                  <div className="ias7-line-left">
                    <span className="tree-branch">└──</span>
                    <span className="ias7-line-name">Equity transactions</span>
                    <small className="ias7-line-hint">
                      Shareholder capital contributions or dividend distributions
                    </small>
                  </div>
                  <div className="ias7-line-right">
                    {equityTransactions ? (
                      <span className="positive">+<Money value={equityTransactions} /></span>
                    ) : (
                      <span className="zero-val">₹0.00</span>
                    )}
                  </div>
                </div>

                <div className="ias7-extensible-note">
                  <Info size={14} />
                  <span>
                    Financing cash flow tracks debt and equity capital structures. Bank debt settlements and equity capital injections flow directly into this standard section.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reconciliation Summary Block */}
        <div className="ias7-reconciliation">
          <div className="reconciliation-row highlight">
            <span className="rec-label">
              Net change in cash & cash equivalents ({isActual ? "Realized" : `Next ${horizon}d`})
            </span>
            <strong
              className={`rec-value ${netChange >= 0 ? "positive" : "negative"}`}
            >
              {netChange >= 0 ? "+" : ""}
              <Money value={netChange} />
            </strong>
          </div>

          <div className="reconciliation-row">
            <span className="rec-label">
              {isActual ? "Opening cash & cash equivalents (Ledger start)" : "Baseline cash today"}
            </span>
            <span className="rec-value">
              <Money value={openingCash} />
            </span>
          </div>

          <div className="reconciliation-row total">
            <span className="rec-label">
              {isActual
                ? "Closing cash & cash equivalents (As of today)"
                : `Projected cash balance (End of ${horizon} days)`}
            </span>
            <span className="rec-value total-cash">
              <Money value={closingCash} />
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
