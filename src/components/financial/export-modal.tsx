import React, { useState } from "react";
import { Download, FileText, FileSpreadsheet, ShieldAlert, Check, X, AlertCircle } from "lucide-react";
import { exportDataFn } from "../../server/api";
import { unwrap, useFinance } from "../state";
import { StepUpModal } from "./step-up-modal";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { view, setNotice } = useFinance();
  const [exportType, setExportType] = useState<"CSV" | "PDF" | "FINANCIAL_REPORT" | "AUDIT_REPORT" | "RECONCILIATION_REPORT">("CSV");
  const [scope, setScope] = useState("invoices");
  const [reason, setReason] = useState("Monthly review");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);

  if (!isOpen) return null;

  const role = view.actor.role;

  async function triggerExport(mfaCode?: string, challengeId?: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await unwrap(
        exportDataFn({
          data: {
            exportType,
            scope,
            format: exportType === "CSV" ? "CSV" : "JSON",
            reason,
            mfaCode,
            challengeId,
          },
        }),
      );

      // Trigger browser download
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setNotice(`Successfully exported ${result.recordCount} records as ${result.filename}`);
      onClose();
    } catch (err: any) {
      const msg = err?.message || "Export failed.";
      if (msg.includes("Step-up") || msg.includes("MFA")) {
        setPendingAction({ exportType, scope, reason });
        setStepUpOpen(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleStartExport(e: React.FormEvent) {
    e.preventDefault();
    triggerExport();
  }

  function handleStepUpSuccess(mfaCode: string, challengeId?: string) {
    setStepUpOpen(false);
    triggerExport(mfaCode, challengeId);
  }

  return (
    <>
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
          zIndex: 9990,
          padding: "16px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            width: "100%",
            maxWidth: "520px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}
        >
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
                <Download size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#0f172a" }}>
                  Export Financial Records
                </h3>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                  Audited Data Access · Role: <strong>{role.toUpperCase()}</strong>
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

          <form onSubmit={handleStartExport} style={{ padding: "24px" }}>
            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  marginBottom: "16px",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Export Format & Report Type
              </label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  background: "#ffffff",
                }}
              >
                <option value="CSV">CSV Data File (.csv)</option>
                <option value="FINANCIAL_REPORT">Executive Financial Report (JSON)</option>
                <option value="RECONCILIATION_REPORT">Reconciliation & Exceptions Report (JSON)</option>
                {role === "admin" && (
                  <option value="AUDIT_REPORT">Immutable Audit Trail (Restricted, JSON)</option>
                )}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Data Scope
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  background: "#ffffff",
                }}
              >
                <option value="invoices">Invoices & Obligations</option>
                <option value="payments">Payment Disbursements</option>
                <option value="receivables">Receivables & Collections</option>
                <option value="reconciliation">Reconciliation Exceptions</option>
                {role !== "viewer" && <option value="full">Complete Financial Snapshot</option>}
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Export Justification / Reason (Audited)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Monthly financial review, tax audit, internal reconciliation"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "20px",
                fontSize: "0.78rem",
                color: "#64748b",
              }}
            >
              <div style={{ fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                Access Policies & Governance:
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {role === "viewer" && <li>Viewer role is limited to 50 records. Audit reports are restricted.</li>}
                {role === "finance" && <li>Finance role can export up to 5,000 records. Bulk exports &gt; 200 require step-up confirmation.</li>}
                {role === "admin" && <li>Administrator role has full access. Bulk exports &gt; 100 or Audit reports require step-up MFA.</li>}
                <li>All exports are permanently logged with timestamps, user credentials, and record counts.</li>
              </ul>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "9px 18px",
                  fontSize: "0.85rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "9px 20px",
                  fontSize: "0.85rem",
                  borderRadius: "6px",
                  border: "none",
                  background: "#176b55",
                  color: "#ffffff",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {loading ? "Generating..." : "Download Export"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <StepUpModal
        isOpen={stepUpOpen}
        actionTitle="Authorize Bulk Data Export"
        actionDescription={`Privileged export of "${scope}" data under ${exportType} requires step-up authentication.`}
        onCancel={() => setStepUpOpen(false)}
        onSuccess={handleStepUpSuccess}
      />
    </>
  );
}
