import {
  simulateScenario,
  formatMoney,
  type ScenarioInput,
  type ScenarioResult,
  type FinancialSnapshot,
  type InvoiceForSimulation,
} from "./scenario-simulator";
import type { Ledger, Actor } from "../../domain/types";
import { financialEngine, paid } from "../finance";
import { today } from "../../domain/money";
import { load } from "../store";
import { actor as getActor } from "../auth";
import { aiConfigured, geminiApiKey, setting } from "../runtime";

/**
 * Extracts a verified FinancialSnapshot in standard currency units (Rupees).
 * Reads strictly from the Financial Engine.
 */
export function getFinancialSnapshot(l: Ledger, asOf = today()): FinancialSnapshot {
  const m = financialEngine(l, asOf);
  const next30DaysOutflow = m.projections[1]?.outflow ?? 0;

  return {
    cash: Math.round(m.cash / 100),
    outstandingPayables: Math.round(m.payables / 100),
    expectedReceivables: Math.round(m.receivables / 100),
    cashCoverageBase: Math.max(1, Math.round(next30DaysOutflow / 100)),
    budget: m.budgets.map((b) => ({
      categoryId: b.category_id,
      budget: Math.round(b.budget_minor / 100),
      actual: Math.round(b.actual / 100),
      committed: Math.round(b.committed / 100),
      remaining: Math.round(b.remaining / 100),
      utilizationPercent: Math.round(b.utilization * 10) / 10,
    })),
  };
}

/**
 * Extracts verified Invoice data for simulation in standard currency units (Rupees).
 */
export function getInvoiceForSimulation(
  l: Ledger,
  invoiceId: string,
  asOf = today(),
): InvoiceForSimulation | undefined {
  const invoice = l.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return undefined;
  const vendor = l.vendors.find((v) => v.id === invoice.vendor_id);
  const paidMinor = paid(l, invoice.id, asOf);

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    vendorName: vendor?.name || "Unknown vendor",
    total: Math.round(invoice.total_minor / 100),
    paid: Math.round(paidMinor / 100),
    status: invoice.status as InvoiceForSimulation["status"],
    categoryId: invoice.category_id,
  };
}

/**
 * Generates a verified natural language explanation of the scenario result.
 * AI never calculates numbers; it only interprets the verified simulation outputs.
 */
export async function explainScenario(result: ScenarioResult): Promise<string> {
  const cash = result.impact.cash;
  const cov = result.impact.cashCoverage;
  const b = result.impact.budget;
  const riskList = result.impact.risks.map((r) => r.message);

  // Deterministic rule-based verified explanation (always accurate and reliable)
  const defaultExplanation = (() => {
    const parts: string[] = [];
    if (cash.change !== 0) {
      const verb = cash.change < 0 ? "reduces" : "increases";
      parts.push(
        `${result.title} ${verb} projected cash from ₹${formatMoney(cash.before)} to ₹${formatMoney(cash.after)}.`,
      );
    } else {
      parts.push(
        `${result.title} keeps immediate cash unchanged at ₹${formatMoney(cash.before)}, representing a commitment rather than immediate cash movement.`,
      );
    }

    if (cov.before !== cov.after) {
      const covVerb = cov.after < cov.before ? "declines" : "improves";
      parts.push(
        `Cash coverage ${covVerb} from ${cov.before.toFixed(2)}× to ${cov.after.toFixed(2)}×.`,
      );
    }

    if (b) {
      parts.push(
        `Category budget utilization moves from ${b.beforeUtilization.toFixed(0)}% to ${b.afterUtilization.toFixed(0)}% (remaining ₹${formatMoney(b.afterRemaining)}).`,
      );
    }

    if (riskList.length) {
      parts.push(`Key considerations: ${riskList.join(" ")}`);
    } else {
      parts.push("No elevated cash coverage or budget risks detected.");
    }

    return parts.join(" ");
  })();

  if (!aiConfigured()) {
    return defaultExplanation;
  }

  try {
    const promptPayload = {
      scenario: result.title,
      currentCash: cash.before,
      scenarioCash: cash.after,
      cashChange: cash.change,
      coverageBefore: cov.before,
      coverageAfter: cov.after,
      budgetBefore: b?.beforeUtilization,
      budgetAfter: b?.afterUtilization,
      risks: riskList,
      assumptions: result.assumptions,
    };

    const sysInstruction =
      "You are Finance Advisor. Your role is to explain the financial scenario simulation result in 2 to 3 concise, clear sentences. Explain the qualitative impact and consequences using ONLY the exact numbers provided in the scenario. Do NOT perform arithmetic or invent new numbers. Highlight cash change, coverage impact, budget changes, and risks.";

    const apiKey = geminiApiKey();
    if (apiKey) {
      const model = setting("GEMINI_MODEL") || setting("AI_MODEL") || "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify(promptPayload) }],
            },
          ],
          systemInstruction: { parts: [{ text: sysInstruction }] },
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 10) {
          return text;
        }
      }
    }
  } catch {
    // If AI network/timeout fails, safely fall back to the verified deterministic text
  }

  return defaultExplanation;
}

/**
 * Top-level server-side simulation entry point.
 * Enforces authentication, company isolation, reads verified financial data,
 * runs the non-mutating simulation, and attaches the AI explanation.
 */
export async function runFinancialScenario(
  companyId: string,
  scenario: ScenarioInput,
  currentActor?: Actor,
): Promise<ScenarioResult> {
  // 1. Verify authenticated user
  const a = currentActor || (await getActor());
  if (!a) {
    throw new Error("Unauthorized");
  }

  // 2. Verify company access
  if (a.company_id !== companyId) {
    throw new Error("Forbidden: Company access mismatch");
  }

  // 3. Retrieve verified financial data from ledger
  const l = await load(a);
  const snapshot = getFinancialSnapshot(l);

  // 4. Retrieve invoice if the scenario requires one
  let invoice: InvoiceForSimulation | undefined;
  if (scenario.invoiceId) {
    invoice = getInvoiceForSimulation(l, scenario.invoiceId);
  }

  // 5. Run non-mutating simulation
  const result = simulateScenario(snapshot, invoice, scenario);

  // 6. Generate AI explanation from verified results
  result.aiExplanation = await explainScenario(result);

  // 7. Return simulation result (persisted: false)
  return result;
}
