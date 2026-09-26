import React from "react";
import { Title } from "../components/ui";
import { AiGovernanceDashboard } from "../components/governance/ai-governance-dashboard";

export function Governance() {
  return (
    <>
      <Title
        eyebrow="NIST AI RMF & PRODUCTION PLATFORM"
        title="AI Governance & Audit"
        description="Active model telemetry, guardrails boundaries, NIST AI RMF 1.0 benchmarks, and immutable AI audit logging."
      />
      <div style={{ marginTop: "20px" }}>
        <AiGovernanceDashboard />
      </div>
    </>
  );
}
