import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type {
  ReconciliationSummary,
  ReconciliationException,
} from "../../domain/finance/reconciliation";
import { money } from "../../domain/money";

interface ReconciliationCardProps {
  reconciliation: ReconciliationSummary;
  onSelectInvoice?: (invoiceId: string) => void;
}

export function ReconciliationCard({
  reconciliation,
  onSelectInvoice,
}: ReconciliationCardProps) {
  const [selectedException, setSelectedException] = useState<ReconciliationException | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "OVERPAYMENT" | "DUPLICATE" | "MISSING" | "UNMATCHED">("ALL");

  const {
    totalExpectedMinor,
    totalMatchedMinor,
    totalDiscrepancyMinor,
    reconciledCount,
    partialCount,
    exceptionsCount,
    unmatchedPaymentsCount,
    overpaymentsCount,
    duplicatePaymentsCount,
    mismatchCount,
    results,
    unmatchedPayments,
    dataAsOf,
    calculationVersion,
  } = reconciliation;

  const allExceptions = results.flatMap((r) => r.exceptions);

  const isHealthy = exceptionsCount === 0 && unmatchedPaymentsCount === 0;

  const filteredExceptions = allExceptions.filter((ex) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "OVERPAYMENT") return ex.type === "OVERPAYMENT";
    if (activeTab === "DUPLICATE") return ex.type === "DUPLICATE_PAYMENT";
    if (activeTab === "MISSING") return ex.type === "MISSING_PAYMENT";
    if (activeTab === "UNMATCHED") return ex.type === "UNMATCHED_PAYMENT";
    return true;
  });

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
        marginBottom: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 22px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          background: "linear-gradient(to right, #fbfdfc, #f8fafc)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: isHealthy ? "#dcfce7" : "#fef3c7",
              color: isHealthy ? "#15803d" : "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isHealthy ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#0f172a" }}>
                Reconciliation Center
              </h3>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: isHealthy ? "#ecfdf5" : "#fef2f2",
                  color: isHealthy ? "#047857" : "#b91c1c",
                  border: isHealthy ? "1px solid #a7f3d0" : "1px solid #fecaca",
                }}
              >
                {isHealthy ? "RECONCILED" : "EXCEPTIONS DETECTED"}
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
              Core Equation: Outstanding = Invoice Amount − Valid Payments − Credits
            </p>
          </div>
        </div>

        <div style={{ fontSize: "0.75rem", color: "#64748b", textAlign: "right" }}>
          <div>Data as of: {new Date(dataAsOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#94a3b8" }}>
            {calculationVersion}
          </div>
        </div>
      </div>

      {/* Main KPI Totals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1px",
          background: "#f1f5f9",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <div style={{ background: "#ffffff", padding: "18px 22px" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>
            Total Invoices
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {money(totalExpectedMinor)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            {results.length} invoices tracked
          </div>
        </div>

        <div style={{ background: "#ffffff", padding: "18px 22px" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>
            Matched Payments
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#15803d", marginTop: "4px" }}>
            − {money(totalMatchedMinor)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            {reconciledCount} fully reconciled
          </div>
        </div>

        <div style={{ background: "#ffffff", padding: "18px 22px" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>
            Outstanding Balance
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#d97706", marginTop: "4px" }}>
            {money(totalExpectedMinor - totalMatchedMinor)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            {partialCount} partially paid
          </div>
        </div>

        <div style={{ background: "#ffffff", padding: "18px 22px" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>
            Exceptions Detected
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: allExceptions.length > 0 ? "#b91c1c" : "#15803d",
              marginTop: "4px",
            }}
          >
            {allExceptions.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            {isHealthy ? "Records agree" : "Action required"}
          </div>
        </div>
      </div>

      {/* Exception Breakdown Badges */}
      {allExceptions.length > 0 && (
        <div style={{ padding: "16px 22px", background: "#fefefe", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>
              Filter Signals:
            </span>
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              style={{
                fontSize: "0.75rem",
                padding: "4px 10px",
                borderRadius: "6px",
                border: activeTab === "ALL" ? "1px solid #176b55" : "1px solid #cbd5e1",
                background: activeTab === "ALL" ? "#e6f4f0" : "#ffffff",
                color: activeTab === "ALL" ? "#176b55" : "#475569",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              All ({allExceptions.length})
            </button>
            {unmatchedPaymentsCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("UNMATCHED")}
                style={{
                  fontSize: "0.75rem",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: activeTab === "UNMATCHED" ? "1px solid #ef4444" : "1px solid #fee2e2",
                  background: activeTab === "UNMATCHED" ? "#fef2f2" : "#ffffff",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ⚠ {unmatchedPaymentsCount} unmatched payments
              </button>
            )}
            {overpaymentsCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("OVERPAYMENT")}
                style={{
                  fontSize: "0.75rem",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: activeTab === "OVERPAYMENT" ? "1px solid #f59e0b" : "1px solid #fef3c7",
                  background: activeTab === "OVERPAYMENT" ? "#fffbeb" : "#ffffff",
                  color: "#b45309",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ⚠ {overpaymentsCount} overpayments
              </button>
            )}
            {duplicatePaymentsCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("DUPLICATE")}
                style={{
                  fontSize: "0.75rem",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: activeTab === "DUPLICATE" ? "1px solid #8b5cf6" : "1px solid #ede9fe",
                  background: activeTab === "DUPLICATE" ? "#f5f3ff" : "#ffffff",
                  color: "#6d28d9",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ⚠ {duplicatePaymentsCount} duplicate signals
              </button>
            )}
            {allExceptions.filter((e) => e.type === "MISSING_PAYMENT").length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("MISSING")}
                style={{
                  fontSize: "0.75rem",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: activeTab === "MISSING" ? "1px solid #64748b" : "1px solid #e2e8f0",
                  background: activeTab === "MISSING" ? "#f8fafc" : "#ffffff",
                  color: "#475569",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ⚠ {allExceptions.filter((e) => e.type === "MISSING_PAYMENT").length} overdue missing
              </button>
            )}
          </div>
        </div>
      )}

      {/* Exception List */}
      <div style={{ padding: "16px 22px" }}>
        {filteredExceptions.length === 0 ? (
          <div
            style={{
              padding: "28px",
              textAlign: "center",
              color: "#15803d",
              background: "#f0fdf4",
              borderRadius: "8px",
              border: "1px dashed #86efac",
            }}
          >
            <CheckCircle2 size={32} style={{ margin: "0 auto 8px" }} />
            <strong style={{ display: "block", fontSize: "0.95rem" }}>
              All records reconciled
            </strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#166534" }}>
              Every valid payment strictly matches invoice obligations. Zero discrepancies detected.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredExceptions.map((ex) => (
              <div
                key={ex.id}
                onClick={() => setSelectedException(selectedException?.id === ex.id ? null : ex)}
                style={{
                  padding: "14px 16px",
                  borderRadius: "8px",
                  border: selectedException?.id === ex.id ? "1.5px solid #176b55" : "1px solid #e2e8f0",
                  background: selectedException?.id === ex.id ? "#f9fcfb" : "#ffffff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        background:
                          ex.severity === "CRITICAL"
                            ? "#fee2e2"
                            : ex.severity === "HIGH"
                              ? "#ffedd5"
                              : "#fef3c7",
                        color:
                          ex.severity === "CRITICAL"
                            ? "#991b1b"
                            : ex.severity === "HIGH"
                              ? "#9a3412"
                              : "#92400e",
                      }}
                    >
                      {ex.type.replace("_", " ")}
                    </span>
                    <strong style={{ fontSize: "0.88rem", color: "#1e293b" }}>
                      {ex.title}
                    </strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#b91c1c" }}>
                      Difference: {money(ex.differenceMinor)}
                    </span>
                    <ChevronRight
                      size={16}
                      style={{
                        transform: selectedException?.id === ex.id ? "rotate(90deg)" : "none",
                        transition: "transform 0.15s",
                        color: "#94a3b8",
                      }}
                    />
                  </div>
                </div>

                <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  {ex.description}
                </p>

                {/* Drill-down expanded section */}
                {selectedException?.id === ex.id && (
                  <div
                    style={{
                      marginTop: "14px",
                      paddingTop: "12px",
                      borderTop: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      borderRadius: "6px",
                      padding: "12px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                      AUDIT & DATA LINEAGE DRILL-DOWN:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.78rem" }}>
                      <div>
                        <span style={{ color: "#64748b" }}>Discrepancy:</span>{" "}
                        <strong style={{ color: "#b91c1c" }}>{money(ex.differenceMinor)}</strong>
                      </div>
                      <div>
                        <span style={{ color: "#64748b" }}>Source Records:</span>{" "}
                        <span style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                          {ex.sourceRecordIds.join(", ") || "None"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "#64748b" }}>Timestamp:</span>{" "}
                        <span>{new Date(ex.timestamp).toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {ex.invoiceId && (
                      <div style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
                        <a
                          href={`/invoices/${ex.invoiceId}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "0.75rem",
                            color: "#176b55",
                            fontWeight: 600,
                            textDecoration: "none",
                            background: "#e6f4f0",
                            padding: "4px 10px",
                            borderRadius: "4px",
                          }}
                        >
                          <ExternalLink size={12} /> Inspect Invoice & Payments
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
