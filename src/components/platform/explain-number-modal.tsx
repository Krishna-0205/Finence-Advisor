import React, { useState, useEffect } from "react";
import {
  HelpCircle,
  X,
  Calculator,
  Layers,
  ArrowRight,
  ExternalLink,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { MetricExplanation } from "../../domain/platform/explain-number";
import { explainNumberFn } from "../../server/api";
import { unwrap } from "../state";
import { money } from "../../domain/money";

interface ExplainNumberModalProps {
  metricKey:
    | "PROJECTED_CASH"
    | "CURRENT_CASH"
    | "OUTSTANDING_PAYABLES"
    | "EXPECTED_RECEIVABLES"
    | "BUDGET_UTILIZATION";
  isOpen: boolean;
  onClose: () => void;
}

export function ExplainNumberModal({
  metricKey,
  isOpen,
  onClose,
}: ExplainNumberModalProps) {
  const [data, setData] = useState<MetricExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"LEVEL1" | "LEVEL2" | "LEVEL3">("LEVEL2");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    unwrap(explainNumberFn({ data: { metricKey } }))
      .then((res) => setData(res))
      .catch((err) => console.error("Error loading explanation:", err))
      .finally(() => setLoading(false));
  }, [metricKey, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "600px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(to right, #fbfdfc, #f8fafc)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#e6f4f0",
                color: "#176b55",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Calculator size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#0f172a" }}>
                {data?.title || "Explain This Number"}
              </h3>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                Deterministic Mathematical Lineage & Evidence
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
            padding: "0 24px",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("LEVEL1")}
            style={{
              padding: "10px 16px",
              border: "none",
              background: activeTab === "LEVEL1" ? "#f0fdfa" : "transparent",
              fontSize: "0.82rem",
              fontWeight: activeTab === "LEVEL1" ? 750 : 600,
              color: activeTab === "LEVEL1" ? "#0f766e" : "#334155",
              borderBottom: activeTab === "LEVEL1" ? "3px solid #0f766e" : "3px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Level 1: Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("LEVEL2")}
            style={{
              padding: "10px 16px",
              border: "none",
              background: activeTab === "LEVEL2" ? "#f0fdfa" : "transparent",
              fontSize: "0.82rem",
              fontWeight: activeTab === "LEVEL2" ? 750 : 600,
              color: activeTab === "LEVEL2" ? "#0f766e" : "#334155",
              borderBottom: activeTab === "LEVEL2" ? "3px solid #0f766e" : "3px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Level 2: Calculation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("LEVEL3")}
            style={{
              padding: "10px 16px",
              border: "none",
              background: activeTab === "LEVEL3" ? "#f0fdfa" : "transparent",
              fontSize: "0.82rem",
              fontWeight: activeTab === "LEVEL3" ? 750 : 600,
              color: activeTab === "LEVEL3" ? "#0f766e" : "#334155",
              borderBottom: activeTab === "LEVEL3" ? "3px solid #0f766e" : "3px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Level 3: Source Evidence
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", maxHeight: "450px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
              Loading calculation lineage...
            </div>
          ) : !data ? (
            <div style={{ color: "#ef4444" }}>Could not load explanation.</div>
          ) : (
            <>
              {/* Level 1: Simple Summary */}
              {activeTab === "LEVEL1" && (
                <div style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#334155" }}>
                  <div
                    style={{
                      background: "#f0fdf4",
                      padding: "16px",
                      borderRadius: "8px",
                      border: "1px solid #bbf7d0",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 600, textTransform: "uppercase" }}>
                      Summary Statement
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#15803d", margin: "4px 0 8px" }}>
                      {data.formattedValue}
                    </div>
                    <p style={{ margin: 0, color: "#166534" }}>{data.level1Simple}</p>
                  </div>
                </div>
              )}

              {/* Level 2: Mathematical Calculation */}
              {activeTab === "LEVEL2" && (
                <div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      background: "#0f172a",
                      color: "#f8fafc",
                      padding: "16px",
                      borderRadius: "8px",
                      marginBottom: "18px",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "6px" }}>
                      MATHEMATICAL FORMULA:
                    </div>
                    <div>{data.level2Calculation.formula}</div>
                  </div>

                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ background: "#f8fafc", padding: "10px 14px", fontWeight: 600, fontSize: "0.8rem", color: "#475569" }}>
                      Calculation Components
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {data.level2Calculation.terms.map((t, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            fontSize: "0.85rem",
                            borderBottom: idx < data.level2Calculation.terms.length - 1 ? "1px solid #f1f5f9" : "none",
                          }}
                        >
                          <span style={{ color: "#334155" }}>{t.label}</span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 600,
                              color: t.sign === "−" ? "#b91c1c" : "#15803d",
                            }}
                          >
                            {t.sign} {money(t.valueMinor)}
                          </span>
                        </div>
                      ))}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 14px",
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          background: "#fafafa",
                        }}
                      >
                        <span>Result</span>
                        <span style={{ color: "#0f172a" }}>{money(data.level2Calculation.resultMinor)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Level 3: Evidence & Lineage */}
              {activeTab === "LEVEL3" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px", fontSize: "0.78rem" }}>
                    <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px" }}>
                      <span style={{ color: "#64748b" }}>Calculation Version:</span>{" "}
                      <strong>{data.level3Evidence.calculationVersion}</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px" }}>
                      <span style={{ color: "#64748b" }}>Data As Of:</span>{" "}
                      <strong>{data.level3Evidence.dataAsOf}</strong>
                    </div>
                  </div>

                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 14px" }}>
                    {data.level3Evidence.methodology}
                  </p>

                  {data.level3Evidence.inflows.length > 0 && (
                    <div style={{ marginBottom: "14px" }}>
                      <strong style={{ fontSize: "0.8rem", color: "#166534" }}>
                        Expected Inflows ({data.level3Evidence.inflows.length} records):
                      </strong>
                      <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {data.level3Evidence.inflows.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.78rem",
                              padding: "6px 10px",
                              background: "#f0fdf4",
                              borderRadius: "4px",
                            }}
                          >
                            <span>{item.name}</span>
                            <strong style={{ color: "#15803d" }}>+ {money(item.amountMinor)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.level3Evidence.outflows.length > 0 && (
                    <div>
                      <strong style={{ fontSize: "0.8rem", color: "#991b1b" }}>
                        Committed Outflows ({data.level3Evidence.outflows.length} records):
                      </strong>
                      <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {data.level3Evidence.outflows.slice(0, 8).map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.78rem",
                              padding: "6px 10px",
                              background: "#fef2f2",
                              borderRadius: "4px",
                            }}
                          >
                            <span>{item.name}</span>
                            <strong style={{ color: "#b91c1c" }}>− {money(item.amountMinor)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", textAlign: "right" }}>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
