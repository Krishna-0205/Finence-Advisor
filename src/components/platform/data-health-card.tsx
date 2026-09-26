import React, { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  FileCheck,
  Layers,
} from "lucide-react";
import type { FinancialDataHealth, DataHealthMetric } from "../../domain/platform/data-health";
import { dataHealthFn } from "../../server/api";
import { unwrap } from "../state";

export function DataHealthCard() {
  const [data, setData] = useState<FinancialDataHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    setRefreshing(true);
    unwrap(dataHealthFn())
      .then((res) => setData(res))
      .catch((err) => console.error("Error loading data health:", err))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          padding: "20px",
          color: "var(--text-muted, #64748b)",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Clock size={16} /> Evaluating financial data completeness, freshness & reconciliation...
      </div>
    );
  }

  if (!data) return null;

  const getStatusColor = (score: number) => {
    if (score >= 90) return { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a" };
    if (score >= 75) return { bg: "#eff6ff", border: "#bfdbfe", text: "#2563eb" };
    if (score >= 60) return { bg: "#fffbeb", border: "#fde68a", text: "#d97706" };
    return { bg: "#fef2f2", border: "#fecaca", text: "#dc2626" };
  };

  const statusStyle = getStatusColor(data.overallScore);

  const dimensions: { label: string; metric: DataHealthMetric; desc: string }[] = [
    { label: "Data Completeness", metric: data.completeness, desc: "Required fields, vendor & category mappings" },
    { label: "Data Consistency", metric: data.consistency, desc: "Mathematical integrity, currency & totals alignment" },
    { label: "Data Freshness", metric: data.freshness, desc: "Recency of transactions and ledger state updates" },
    { label: "Data Integrity", metric: data.integrity, desc: "Duplicate signal isolation and structural validation" },
    { label: "Reconciliation", metric: data.reconciliation, desc: "Bank balance matching and unmatched line items" },
  ];

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.05)",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              padding: "6px 8px",
              borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.1)",
              color: "#059669",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <ShieldCheck size={16} /> Financial Data Health
          </div>
          <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
            Calculated across 5 deterministic data-quality dimensions
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              color: "#64748b",
              backgroundColor: "#f1f5f9",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            {data.calculationVersion}
          </span>
          <button
            onClick={loadData}
            disabled={refreshing}
            className="secondary"
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              gap: "5px",
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            {refreshing ? "Recalculating..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Main Score Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "24px",
          padding: "18px 20px",
          borderRadius: "12px",
          backgroundColor: statusStyle.bg,
          border: `1px solid ${statusStyle.border}`,
          marginBottom: "24px",
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "center", minWidth: "120px" }}>
          <div
            style={{
              fontSize: "42px",
              fontWeight: 800,
              color: statusStyle.text,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {data.overallScore}%
          </div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: statusStyle.text,
              marginTop: "4px",
            }}
          >
            Data Health: {data.status}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "4px" }}>
            Deterministic Data Quality & Lineage Verification
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            High-quality AI outputs and automated recommendations require zero data ambiguity. The engine
            verifies mandatory fields, mathematical reconciliation, duplicate isolation, and transactional
            freshness before computing predictions.
          </div>
        </div>
      </div>

      {/* 5 Dimensions Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {dimensions.map(({ label, metric, desc }) => {
          const isHealthy = metric.status === "HEALTHY";
          const isWarning = metric.status === "WARNING";

          return (
            <div
              key={label}
              style={{
                padding: "14px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>{label}</span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: isHealthy ? "#16a34a" : isWarning ? "#d97706" : "#dc2626",
                  }}
                >
                  {metric.score}%
                </span>
              </div>

              {/* Mini progress bar */}
              <div
                style={{
                  height: "6px",
                  borderRadius: "3px",
                  backgroundColor: "#e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${metric.score}%`,
                    backgroundColor: isHealthy ? "#16a34a" : isWarning ? "#f59e0b" : "#ef4444",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.4 }}>
                {metric.summary}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actionable Issues Section */}
      <div>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "#475569",
            marginBottom: "12px",
          }}
        >
          Actionable Health Items ({data.issues.length})
        </div>

        {data.issues.length === 0 ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "8px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#16a34a",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} /> All 5 financial dimensions are fully validated with zero outstanding issues.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.issues.map((issue) => {
              const isCrit = issue.severity === "CRITICAL";

              return (
                <div
                  key={issue.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    backgroundColor: isCrit ? "rgba(254, 242, 242, 0.6)" : "#f8fafc",
                    border: isCrit ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid #e2e8f0",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {isCrit ? (
                      <XCircle size={16} color="#dc2626" />
                    ) : (
                      <AlertTriangle size={16} color="#d97706" />
                    )}
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                        {issue.title}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                        — {issue.description}
                      </span>
                    </div>
                  </div>

                  <a
                    href={issue.actionUrl}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--primary, #2563eb)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {issue.actionText} <ArrowRight size={12} />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
