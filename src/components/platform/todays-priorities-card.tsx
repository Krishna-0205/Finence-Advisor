import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { AlertPriority, SmartPrioritiesSummary } from "../../domain/platform/alert-prioritization";
import { smartPrioritiesFn } from "../../server/api";
import { unwrap } from "../state";
import { money } from "../../domain/money";

export function TodaysPrioritiesCard() {
  const [data, setData] = useState<SmartPrioritiesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let mounted = true;
    unwrap(smartPrioritiesFn())
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => console.error("Error loading smart priorities:", err))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.04), rgba(249, 115, 22, 0.04))",
          borderRadius: "14px",
          border: "1px solid rgba(239, 68, 68, 0.15)",
          padding: "20px",
          minHeight: "140px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted, #64748b)",
          fontSize: "14px",
        }}
      >
        <Clock size={16} style={{ marginRight: "8px", animation: "spin 1s linear infinite" }} />
        Analyzing financial signals & prioritizing action items...
      </div>
    );
  }

  if (!data || data.topPriorities.length === 0) {
    return (
      <div
        style={{
          background: "linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(16, 185, 129, 0.03))",
          borderRadius: "14px",
          border: "1px solid rgba(34, 197, 94, 0.2)",
          padding: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "rgba(34, 197, 94, 0.15)",
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#16a34a", fontSize: "15px" }}>
              All Clear — Zero Critical Attention Items Today
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
              Deterministic prioritization scanned all cash, overdue, and budget thresholds.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayedList = showAll ? data.allPriorities : data.topPriorities;

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
        borderRadius: "14px",
        border: "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.06)",
        padding: "22px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top Banner Accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #ef4444 0%, #f97316 50%, #eab308 100%)",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              padding: "6px 8px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.1)",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <Flame size={15} /> Today's Priorities
          </div>
          <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
            Deterministic rank based on financial impact, urgency & confidence
          </span>
        </div>

        {data.allPriorities.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 650,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 1px 2px rgba(37, 99, 235, 0.08)",
            }}
          >
            {showAll ? (
              <>Show Top 3 <ChevronUp size={14} /></>
            ) : (
              <>View all {data.allPriorities.length} items <ChevronDown size={14} /></>
            )}
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {displayedList.map((item, index) => {
          const isCritical = item.severity === "CRITICAL";
          const isHigh = item.severity === "HIGH";

          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: "10px",
                backgroundColor: isCritical
                  ? "rgba(254, 242, 242, 0.7)"
                  : isHigh
                  ? "rgba(255, 247, 237, 0.7)"
                  : "#ffffff",
                border: isCritical
                  ? "1px solid rgba(248, 113, 113, 0.3)"
                  : isHigh
                  ? "1px solid rgba(251, 146, 60, 0.3)"
                  : "1px solid #e2e8f0",
                gap: "14px",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1 }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 700,
                    background: isCritical ? "#ef4444" : isHigh ? "#f97316" : "#64748b",
                    color: "#ffffff",
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginBottom: "3px",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: isCritical ? "#fee2e2" : "#ffedd5",
                        color: isCritical ? "#b91c1c" : "#c2410c",
                      }}
                    >
                      Priority Score {item.priorityScore}/100
                    </span>
                    {item.dueDate && (
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Due: {item.dueDate}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {item.actionRationale}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {item.financialImpactMinor > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>
                      Impact
                    </div>
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>
                      {money(item.financialImpactMinor)}
                    </div>
                  </div>
                )}
                <a
                  href={item.linkUrl}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 650,
                    textDecoration: "none",
                    backgroundColor: isCritical ? "#dc2626" : "#0f766e",
                    color: "#ffffff",
                    boxShadow: isCritical
                      ? "0 2px 6px rgba(220, 38, 38, 0.3)"
                      : "0 2px 6px rgba(15, 118, 110, 0.28)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {item.actionText} <ArrowRight size={13} />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
