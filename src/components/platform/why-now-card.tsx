import React, { useState, useEffect } from "react";
import {
  HelpCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  FileText,
  CheckCircle,
  Lightbulb,
} from "lucide-react";
import type { WhyNowRecommendation } from "../../domain/platform/recommendation-engine";
import { whyNowFn } from "../../server/api";
import { unwrap } from "../state";
import { money } from "../../domain/money";

export function WhyNowCard() {
  const [recommendations, setRecommendations] = useState<WhyNowRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    unwrap(whyNowFn())
      .then((res) => {
        if (mounted) {
          setRecommendations(res);
          if (res.length > 0) setExpandedId(res[0].id);
        }
      })
      .catch((err) => console.error("Error loading Why Now recommendations:", err))
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
        <Clock size={16} /> Generating evidence-backed "Why Now?" recommendations...
      </div>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.05)",
        padding: "22px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              padding: "6px 8px",
              borderRadius: "8px",
              background: "rgba(37, 99, 235, 0.1)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <Lightbulb size={15} /> "Why Now?" Decision Framework
          </div>
          <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
            Every recommendation backed by evidence, urgency & calculated consequences
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {recommendations.map((rec) => {
          const isExpanded = expandedId === rec.id;
          const isCritical = rec.severity === "CRITICAL";

          return (
            <div
              key={rec.id}
              style={{
                borderRadius: "10px",
                border: isCritical
                  ? "1px solid rgba(239, 68, 68, 0.3)"
                  : "1px solid rgba(226, 232, 240, 0.9)",
                overflow: "hidden",
                transition: "all 0.2s ease",
              }}
            >
              {/* Card Header / Summary */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                style={{
                  padding: "14px 16px",
                  background: isCritical
                    ? "rgba(254, 242, 242, 0.5)"
                    : isExpanded
                    ? "rgba(248, 250, 252, 0.8)"
                    : "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: isCritical ? "#ef4444" : "#f59e0b",
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
                    {rec.title}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor: isCritical ? "#fee2e2" : "#fef3c7",
                      color: isCritical ? "#b91c1c" : "#92400e",
                    }}
                  >
                    {rec.severity}
                  </span>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    {isExpanded ? "Collapse" : "Expand"}
                  </span>
                </div>
              </div>

              {/* 4-Question Schema Body */}
              {isExpanded && (
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#ffffff",
                    borderTop: "1px solid #f1f5f9",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        1. Why This?
                      </div>
                      <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: 1.5 }}>
                        {rec.whyThis}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#2563eb",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        2. Why Now?
                      </div>
                      <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: 1.5 }}>
                        {rec.whyNow}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#dc2626",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        3. What Happens If Ignored?
                      </div>
                      <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: 1.5 }}>
                        {rec.consequenceIfIgnored}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#16a34a",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        4. Recommended Action
                      </div>
                      <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: 1.5, fontWeight: 500 }}>
                        {rec.suggestedAction}
                      </div>
                    </div>
                  </div>

                  {/* Evidence Lineage Strip */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "10px",
                      paddingTop: "8px",
                      borderTop: "1px dashed #e2e8f0",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                        EVIDENCE LINEAGE:
                      </span>
                      {rec.evidence.map((ev, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "11px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            backgroundColor: "#f1f5f9",
                            color: "#334155",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <FileText size={10} /> {ev.label}{" "}
                          {ev.valueMinor ? `(${money(ev.valueMinor)})` : ""}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      {rec.calculationIds.map((calcId, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "10px",
                            fontFamily: "monospace",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            backgroundColor: "#e0e7ff",
                            color: "#3730a3",
                          }}
                        >
                          calc:{calcId}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
