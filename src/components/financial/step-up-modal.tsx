import React, { useState } from "react";
import { ShieldCheck, KeyRound, AlertCircle, X, Check } from "lucide-react";
import { verifyStepUpFn, stepUpChallengeFn } from "../../server/api";
import { unwrap } from "../state";

export interface StepUpModalProps {
  actionTitle: string;
  actionDescription: string;
  onSuccess: (mfaCode: string, challengeId?: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function StepUpModal({
  actionTitle,
  actionDescription,
  onSuccess,
  onCancel,
  isOpen,
}: StepUpModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challengeId, setChallengeId] = useState<string | undefined>();

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Please enter the 6-digit confirmation code.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await unwrap(
        verifyStepUpFn({
          data: {
            action: actionTitle,
            code: code.trim(),
            challengeId,
          },
        }),
      );
      onSuccess(code.trim(), challengeId);
    } catch (err: any) {
      setError(err?.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  function handleUseDemoCode() {
    setCode("123456");
    setError(null);
  }

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
          maxWidth: "460px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #176b55 0%, #0d4a3a 100%)",
            color: "#ffffff",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                Step-Up Authentication
              </h3>
              <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.85 }}>
                Administrative Verification Required
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff",
              cursor: "pointer",
              padding: "4px",
              opacity: 0.8,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "18px",
              fontSize: "0.85rem",
              color: "#166534",
            }}
          >
            <strong>{actionTitle}</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#15803d" }}>
              {actionDescription}
            </p>
          </div>

          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fef3c7",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "18px",
              fontSize: "0.78rem",
              color: "#92400e",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <KeyRound size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Security Protocol Notice:</strong> Step-up authentication provides re-authentication for sensitive actions. It does not replace role authorization or Segregation of Duties.
            </div>
          </div>

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

          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <label
                htmlFor="mfa-input"
                style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155" }}
              >
                Enter 6-Digit OTP / Confirmation Code
              </label>
              <button
                type="button"
                onClick={handleUseDemoCode}
                style={{
                  fontSize: "0.72rem",
                  color: "#176b55",
                  background: "#e6f4f0",
                  border: "none",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Use Demo OTP (123456)
              </button>
            </div>
            <input
              id="mfa-input"
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 123456"
              autoFocus
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "1.1rem",
                letterSpacing: "4px",
                textAlign: "center",
                fontWeight: 600,
                border: "2px solid #cbd5e1",
                borderRadius: "8px",
                outline: "none",
                fontFamily: "monospace",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "9px 18px",
                fontSize: "0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                cursor: "pointer",
                fontWeight: 500,
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
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                "Verifying..."
              ) : (
                <>
                  <Check size={16} /> Confirm & Authorize
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
