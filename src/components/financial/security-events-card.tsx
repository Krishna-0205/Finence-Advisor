import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  FileSpreadsheet,
  Cpu,
  Gauge,
  Lock,
  RefreshCw,
  Clock,
  UserCheck,
} from "lucide-react";
import type { SecurityEvent, SecuritySummary } from "../../domain/finance/security";
import { securitySummaryFn, securityEventsFn } from "../../server/api";
import { unwrap } from "../state";

export function SecurityEventsCard() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("ALL");

  async function loadEvents() {
    setLoading(true);
    try {
      const res = await unwrap(securitySummaryFn());
      setSummary(res);
    } catch (err) {
      console.error("Failed to load security events", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const stats = summary?.last24Hours || {
    failedLogins: 0,
    failedAuthorizations: 0,
    mfaFailures: 0,
    bulkExports: 0,
    largeImports: 0,
    aiRequests: 0,
    rateLimits: 0,
    totalEvents: 0,
  };

  const events = summary?.events || [];

  const filteredEvents = events.filter((ev) => {
    if (filterType === "ALL") return true;
    if (filterType === "FAILURES") {
      return ["LOGIN_FAILURE", "AUTHORIZATION_FAILURE", "MFA_FAILURE"].includes(ev.eventType);
    }
    if (filterType === "RATE_LIMITS") return ev.eventType === "RATE_LIMIT";
    if (filterType === "EXPORTS") return ev.eventType === "BULK_EXPORT";
    if (filterType === "AI") return ev.eventType === "AI_REQUEST";
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
          background: "linear-gradient(to right, #0f172a, #1e293b)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                Security Controls & Event Dashboard
              </h3>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(255, 255, 255, 0.2)",
                  color: "#cbd5e1",
                }}
              >
                OWASP ASVS 5.0
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", opacity: 0.8 }}>
              Continuous monitoring for authentication, authorization, rate limits & privileged data exports
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadEvents}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#ffffff",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "0.75rem",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 500,
          }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* 24h Metrics Overview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "1px",
          background: "#f1f5f9",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>FAILED LOGINS</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: stats.failedLogins > 0 ? "#b91c1c" : "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.failedLogins}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Last 24 hours</div>
        </div>

        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>AUTH FAILURES</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: stats.failedAuthorizations > 0 ? "#b91c1c" : "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.failedAuthorizations}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>RBAC violations</div>
        </div>

        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>MFA FAILURES</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: stats.mfaFailures > 0 ? "#ea580c" : "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.mfaFailures}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Step-up rejected</div>
        </div>

        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>BULK EXPORTS</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.bulkExports}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Audited data access</div>
        </div>

        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>LARGE IMPORTS</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.largeImports}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Pre-validated CSV</div>
        </div>

        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>AI REQUESTS</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.aiRequests}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Bounded queries</div>
        </div>

        <div style={{ background: "#ffffff", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>RATE LIMITS</div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: stats.rateLimits > 0 ? "#ea580c" : "#0f172a",
              marginTop: "4px",
            }}
          >
            {stats.rateLimits}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Enforced quotas</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ padding: "12px 22px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Filter:</span>
          {["ALL", "FAILURES", "RATE_LIMITS", "EXPORTS", "AI"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterType(f)}
              style={{
                fontSize: "0.72rem",
                padding: "3px 8px",
                borderRadius: "4px",
                border: filterType === f ? "1px solid #0f172a" : "1px solid #e2e8f0",
                background: filterType === f ? "#0f172a" : "#ffffff",
                color: filterType === f ? "#ffffff" : "#475569",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Event Stream */}
      <div style={{ padding: "16px 22px" }}>
        {filteredEvents.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "#64748b",
              background: "#f8fafc",
              borderRadius: "8px",
              border: "1px dashed #cbd5e1",
              fontSize: "0.82rem",
            }}
          >
            <ShieldCheck size={28} style={{ margin: "0 auto 6px", color: "#16a34a" }} />
            No security events matching this filter.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredEvents.slice(0, 20).map((ev) => {
              const isCrit = ev.severity === "CRITICAL";
              const isWarn = ev.severity === "WARNING";
              return (
                <div
                  key={ev.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    border: "1px solid #f1f5f9",
                    background: isCrit ? "#fff5f5" : isWarn ? "#fffbeb" : "#fafafa",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        background: isCrit ? "#fee2e2" : isWarn ? "#fef3c7" : "#e2e8f0",
                        color: isCrit ? "#991b1b" : isWarn ? "#92400e" : "#334155",
                        marginTop: "1px",
                      }}
                    >
                      {ev.eventType}
                    </span>
                    <div>
                      <strong style={{ fontSize: "0.82rem", color: "#1e293b", display: "block" }}>
                        {ev.title}
                      </strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                        {ev.description}
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                      <Clock size={11} />
                      {new Date(ev.occurredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    {ev.userName && (
                      <div style={{ fontSize: "0.7rem", color: "#475569", marginTop: "2px" }}>
                        {ev.userName}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
