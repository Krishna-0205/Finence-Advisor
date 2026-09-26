import { useState } from "react";
import { scenarioFn } from "../../server/api";
import { unwrap } from "../state";
import type { ScenarioInput, ScenarioResult } from "../../server/financial/scenario-simulator";
import { Sparkles, ArrowRight, AlertTriangle, ShieldAlert, CheckCircle2, Clock } from "lucide-react";

export type { ScenarioResult };

export interface ScenarioSimulatorProps {
  invoice: {
    id: string;
    invoiceNumber: string;
    vendorName: string;
    total: number;
    paid: number;
    status: string;
  };

  onSimulate?: (
    scenario: ScenarioInput,
  ) => Promise<ScenarioResult>;
}

export function ScenarioSimulator({
  invoice,
  onSimulate,
}: ScenarioSimulatorProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [showPartial, setShowPartial] = useState(false);

  const outstanding = Math.max(0, invoice.total - invoice.paid);

  async function executeSimulation(scenario: ScenarioInput) {
    setLoading(true);
    setError("");

    try {
      if (onSimulate) {
        const response = await onSimulate(scenario);
        setResult(response);
      } else {
        const response = await unwrap(scenarioFn({ data: scenario }));
        setResult(response);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function simulatePayment() {
    await executeSimulation({
      type: "PAY_INVOICE",
      invoiceId: invoice.id,
    });
  }

  async function simulateApproval() {
    await executeSimulation({
      type: "APPROVE_INVOICE",
      invoiceId: invoice.id,
    });
  }

  async function simulateDelay() {
    await executeSimulation({
      type: "DELAY_PAYMENT",
      invoiceId: invoice.id,
      delayDays: 30,
    });
  }

  async function simulatePartialPayment(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(customAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid partial payment amount.");
      return;
    }
    await executeSimulation({
      type: "PARTIAL_PAYMENT",
      invoiceId: invoice.id,
      amount: parsed,
    });
  }

  const isPendingReview = [
    "PENDING_REVIEW",
    "INVESTIGATION",
    "INVESTIGATING",
    "EXTRACTED",
  ].includes(invoice.status);

  const canSimulatePayment = [
    "APPROVED",
    "SCHEDULED",
  ].includes(invoice.status);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mt-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              What-If Simulator
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              Verified Sandbox
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            See the financial impact before taking an action. Reads verified ledger data and never changes records.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-semibold text-gray-900">
              {invoice.invoiceNumber}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.vendorName}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400 uppercase tracking-wider block">Outstanding</span>
            <span className="text-lg font-bold text-gray-900">
              ₹{outstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {canSimulatePayment && (
          <button
            type="button"
            disabled={loading || outstanding <= 0}
            onClick={simulatePayment}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 transition cursor-pointer"
          >
            {loading ? "Simulating..." : "What if I pay today?"}
          </button>
        )}

        {isPendingReview && (
          <button
            type="button"
            disabled={loading}
            onClick={simulateApproval}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 transition cursor-pointer"
          >
            {loading ? "Simulating..." : "What if I approve?"}
          </button>
        )}

        {canSimulatePayment && (
          <button
            type="button"
            disabled={loading}
            onClick={simulateDelay}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
          >
            What if I delay 30 days?
          </button>
        )}

        {canSimulatePayment && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowPartial(!showPartial)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
          >
            {showPartial ? "Close partial" : "Partial payment..."}
          </button>
        )}
      </div>

      {showPartial && (
        <form onSubmit={simulatePartialPayment} className="mt-3 flex items-center gap-2 max-w-sm">
          <input
            type="number"
            min="1"
            max={outstanding}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder={`Amount (max ₹${outstanding.toLocaleString("en-IN")})`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-600"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-gray-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-black disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            Simulate
          </button>
        </form>
      )}

      {result && <ScenarioResultView result={result} />}
    </section>
  );
}

export function ScenarioResultView({ result }: { result: ScenarioResult }) {
  const cash = result.impact.cash;
  const coverage = result.impact.cashCoverage;
  const budget = result.impact.budget;

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <span>Scenario:</span>
          <span className="text-emerald-700 font-bold">{result.title}</span>
        </h3>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" /> Non-persisted simulation
        </span>
      </div>

      {result.aiExplanation && (
        <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200/80 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            AI Advisor Explanation
          </div>
          <p className="mt-1 text-sm text-emerald-900 leading-relaxed">
            {result.aiExplanation}
          </p>
          <div className="mt-2 text-xs text-emerald-700/80">
            Explained from verified simulation results. The AI performs no arithmetic.
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Current cash"
          value={formatRupees(cash.before)}
        />

        <MetricCard
          label="Cash impact"
          value={formatRupees(cash.change)}
          negative={cash.change < 0}
          positive={cash.change > 0}
        />

        <MetricCard
          label="Projected new cash"
          value={formatRupees(cash.after)}
          highlight
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            30-Day Cash Coverage
          </h4>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-gray-600">Before</span>
            <strong className="text-gray-900 font-semibold">{coverage.before.toFixed(2)}×</strong>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm pt-1 border-t border-gray-100">
            <span className="text-gray-600">After scenario</span>
            <strong
              className={`font-bold ${
                coverage.after < 1
                  ? "text-red-600"
                  : coverage.after < 1.5
                    ? "text-amber-600"
                    : "text-emerald-700"
              }`}
            >
              {coverage.after.toFixed(2)}×
            </strong>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Cash coverage = Available cash ÷ Next 30 days obligations
          </div>
        </div>

        {budget ? (
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Category Budget Impact
            </h4>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Before utilization</div>
                <div className="mt-0.5 text-base font-semibold text-gray-900">
                  {budget.beforeUtilization.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-400">
                  ₹{budget.beforeRemaining.toLocaleString("en-IN")} left
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">After scenario</div>
                <div
                  className={`mt-0.5 text-base font-bold ${
                    budget.afterUtilization >= 100
                      ? "text-red-600"
                      : budget.afterUtilization >= 90
                        ? "text-amber-600"
                        : "text-emerald-700"
                  }`}
                >
                  {budget.afterUtilization.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">
                  ₹{budget.afterRemaining.toLocaleString("en-IN")} left
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50 flex flex-col justify-center">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Budget Status
            </div>
            <p className="mt-1 text-sm text-gray-600">
              No specific category budget restriction affected by this scenario.
            </p>
          </div>
        )}
      </div>

      {result.impact.risks.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.impact.risks.map((risk, index) => (
            <div
              key={index}
              className={`rounded-lg border p-3 text-sm flex items-start gap-2.5 ${
                risk.level === "HIGH"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {risk.level === "HIGH" ? (
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <strong className="block font-semibold">
                  {risk.level === "HIGH" ? "High Risk Alert" : "Caution / Attention"}
                </strong>
                <div className="mt-0.5 text-xs sm:text-sm">
                  {risk.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.assumptions.length > 0 && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 border border-gray-100">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Simulation Assumptions
          </div>
          <ul className="mt-1.5 list-disc list-inside text-xs text-gray-600 space-y-1">
            {result.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
        <span className="flex items-center gap-1.5 text-gray-500 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Simulation only. No financial records were changed.
        </span>
        <span>Persisted: false</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  negative = false,
  positive = false,
  highlight = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          negative
            ? "text-red-600"
            : positive
              ? "text-emerald-600"
              : highlight
                ? "text-emerald-900"
                : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatRupees(value: number) {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}
