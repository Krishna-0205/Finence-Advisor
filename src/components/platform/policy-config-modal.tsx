import React, { useState, useEffect } from "react";
import {
  Settings,
  X,
  ShieldAlert,
  CheckCircle,
  Save,
  Clock,
  History,
  AlertTriangle,
  Lock,
} from "lucide-react";
import type { FinancialPolicy } from "../../domain/platform/policy-config";
import { companyPolicyFn, updatePolicyFn } from "../../server/api";
import { unwrap } from "../state";
import { money } from "../../domain/money";

interface PolicyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
}

export function PolicyConfigModal({ isOpen, onClose, isAdmin }: PolicyConfigModalProps) {
  const [policy, setPolicy] = useState<FinancialPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [cashWarningRupees, setCashWarningRupees] = useState<number>(500000);
  const [cashCriticalRupees, setCashCriticalRupees] = useState<number>(300000);
  const [budgetWarningPct, setBudgetWarningPct] = useState<number>(80);
  const [budgetCriticalPct, setBudgetCriticalPct] = useState<number>(90);
  const [dupThreshold, setDupThreshold] = useState<number>(85);
  const [overdueDays, setOverdueDays] = useState<number>(30);
  const [aiRateLimit, setAiRateLimit] = useState<number>(10);
  const [maxFinanceRupees, setMaxFinanceRupees] = useState<number>(500000);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    unwrap(companyPolicyFn())
      .then((p) => {
        setPolicy(p);
        setCashWarningRupees(p.cashWarningMinor / 100);
        setCashCriticalRupees(p.cashCriticalMinor / 100);
        setBudgetWarningPct(p.budgetWarningPercentage);
        setBudgetCriticalPct(p.budgetCriticalPercentage);
        setDupThreshold(p.duplicateThreshold);
        setOverdueDays(p.overdueThresholdDays);
        setAiRateLimit(p.aiRequestsPerMinute);
        setMaxFinanceRupees(p.approvalLimits.maxFinanceMinor / 100);
      })
      .catch((err) => {
        console.error("Failed to load policy:", err);
        setErrorMsg("Failed to load company policy.");
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg("Only administrators can update financial policy thresholds.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const updated = await unwrap(
        updatePolicyFn({
          data: {
            updates: {
              cashWarningMinor: cashWarningRupees * 100,
              cashCriticalMinor: cashCriticalRupees * 100,
              budgetWarningPercentage: budgetWarningPct,
              budgetCriticalPercentage: budgetCriticalPct,
              duplicateThreshold: dupThreshold,
              overdueThresholdDays: overdueDays,
              aiRequestsPerMinute: aiRateLimit,
              approvalLimits: {
                maxFinanceMinor: maxFinanceRupees * 100,
                adminRequiredAboveMinor: maxFinanceRupees * 100,
              },
            },
          },
        }),
      );
      setPolicy(updated);
      setSaveSuccess(true);
    } catch (err: any) {
      console.error("Failed to save policy:", err);
      setErrorMsg(err.message || "Failed to update financial policy.");
    } finally {
      setSaving(false);
    }
  };

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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          maxWidth: "680px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
          border: "1px solid #cbd5e1",
          position: "relative",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "17px", color: "#0f172a" }}>
                Business Rules & Financial Policies
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Immutable Tenant Configuration Layer (Feature 41)
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "24px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              <Clock size={24} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
              <div>Loading financial policy...</div>
            </div>
          ) : (
            <form onSubmit={handleSave}>
              {/* Version & Immutability Badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <History size={16} color="#2563eb" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>
                    Active Version: {policy?.policyVersion}
                  </span>
                  <span style={{ fontSize: "12px", color: "#60a5fa" }}>•</span>
                  <span style={{ fontSize: "12px", color: "#1e40af" }}>
                    Effective: {policy?.effectiveFrom ? new Date(policy.effectiveFrom).toLocaleDateString() : "Active"}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#dbeafe",
                    color: "#1d4ed8",
                  }}
                >
                  v{policy?.version}.0
                </span>
              </div>

              {!isAdmin && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "#fef3c7",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
                  <Lock size={15} /> Viewing policy in read-only mode. Only Admins can commit updates.
                </div>
              )}

              {saveSuccess && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#16a34a",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
                  <CheckCircle size={15} /> Policy updated successfully. New immutable policy version created!
                </div>
              )}

              {errorMsg && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
                  <AlertTriangle size={15} /> {errorMsg}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                {/* Cash Thresholds */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>
                    Cash Flow Thresholds
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Cash Warning Level (₹)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={cashWarningRupees}
                      onChange={(e) => setCashWarningRupees(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Cash Critical Level (₹)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={cashCriticalRupees}
                      onChange={(e) => setCashCriticalRupees(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>

                {/* Budget Warning Percentages */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>
                    Budget Warning Limits
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Budget Warning (%)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={budgetWarningPct}
                      onChange={(e) => setBudgetWarningPct(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Budget Critical (%)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={budgetCriticalPct}
                      onChange={(e) => setBudgetCriticalPct(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>

                {/* Anomaly & Risk Thresholds */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>
                    Risk & Anomaly Rules
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Duplicate Similarity Threshold (0-100)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={dupThreshold}
                      onChange={(e) => setDupThreshold(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Overdue Alert Threshold (Days)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={overdueDays}
                      onChange={(e) => setOverdueDays(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>

                {/* Rate Limits & Governance */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>
                    Governance & Rate Limits
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      AI Requests / User / Min
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={aiRateLimit}
                      onChange={(e) => setAiRateLimit(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Finance Approval Limit (₹)
                    </label>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={maxFinanceRupees}
                      onChange={(e) => setMaxFinanceRupees(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "12px",
                  paddingTop: "16px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  onClick={onClose}
                >
                  Close
                </button>

                {isAdmin && (
                  <button
                    type="submit"
                    className="primary"
                    disabled={saving}
                  >
                    <Save size={15} />
                    {saving ? "Publishing vNext..." : "Publish Versioned Policy"}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
