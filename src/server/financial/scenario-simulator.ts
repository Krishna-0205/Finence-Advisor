export type ScenarioType =
  | "PAY_INVOICE"
  | "APPROVE_INVOICE"
  | "RECEIVE_PAYMENT"
  | "CHANGE_BUDGET"
  | "DELAY_PAYMENT"
  | "PARTIAL_PAYMENT"
  | "ADD_EXPENSE"
  | "CHANGE_RECEIVABLE_DATE";

export interface ScenarioInput {
  type: ScenarioType;

  invoiceId?: string;

  // Used for RECEIVE_PAYMENT, PARTIAL_PAYMENT, ADD_EXPENSE
  amount?: number;

  // Used for CHANGE_BUDGET, ADD_EXPENSE
  categoryId?: string;
  budgetAmount?: number;

  // Used for DELAY_PAYMENT
  delayDays?: number;
}

export interface FinancialSnapshot {
  cash: number;

  outstandingPayables: number;
  expectedReceivables: number;

  budget: {
    categoryId: string;
    budget: number;
    actual: number;
    committed: number;
    remaining: number;
    utilizationPercent: number;
  }[];

  // Near-term obligations used for coverage.
  cashCoverageBase: number;
}

export interface InvoiceForSimulation {
  id: string;
  invoiceNumber: string;
  vendorName: string;

  total: number;
  paid: number;

  status:
    | "DRAFT"
    | "EXTRACTED"
    | "PENDING_REVIEW"
    | "APPROVED"
    | "SCHEDULED"
    | "PAID"
    | "REJECTED"
    | "INVESTIGATION"
    | "INVESTIGATING";

  categoryId: string;
}

export interface ScenarioImpact {
  cash: {
    before: number;
    change: number;
    after: number;
    postPaymentCash?: number;
    postPaymentChange?: number;
  };

  cashCoverage: {
    before: number;
    after: number;
    postPaymentCoverage?: number;
  };

  budget?: {
    categoryId: string;
    beforeUtilization: number;
    afterUtilization: number;
    beforeRemaining: number;
    afterRemaining: number;
  };

  risks: {
    level: "LOW" | "MEDIUM" | "HIGH";
    message: string;
  }[];

  warnings: string[];
}

export interface ScenarioResult {
  scenario: ScenarioInput;

  title: string;

  invoice?: {
    id: string;
    invoiceNumber: string;
    vendorName: string;
    amount: number;
  };

  impact: ScenarioImpact;

  // Useful for audit/UI explanations.
  assumptions: string[];

  // Explicitly indicates that this was NOT persisted.
  persisted: false;

  // Optional AI explanation generated from verified output only
  aiExplanation?: string;
}

export function simulateScenario(
  snapshot: FinancialSnapshot,
  invoice: InvoiceForSimulation | undefined,
  scenario: ScenarioInput,
): ScenarioResult {
  const risks: ScenarioImpact["risks"] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];

  let cashAfter = snapshot.cash;
  let coverageBaseAfter = Math.max(snapshot.cashCoverageBase, 1);
  let coverageAfter = snapshot.cash / coverageBaseAfter;

  let budgetImpact: ScenarioImpact["budget"] | undefined;
  let postPaymentCash: number | undefined;
  let postPaymentChange: number | undefined;
  let postPaymentCoverage: number | undefined;

  const currentCoverage =
    snapshot.cash / Math.max(snapshot.cashCoverageBase, 1);

  switch (scenario.type) {
    case "PAY_INVOICE": {
      if (!invoice) {
        throw new Error("Invoice is required for PAY_INVOICE scenario.");
      }

      if (invoice.status !== "APPROVED" && invoice.status !== "SCHEDULED") {
        throw new Error(
          "Only approved or scheduled invoices can be simulated as payments.",
        );
      }

      const outstanding = Math.max(invoice.total - invoice.paid, 0);

      if (outstanding <= 0) {
        throw new Error("Invoice has no outstanding amount.");
      }

      cashAfter -= outstanding;

      // Coverage is calculated against the same obligation base
      // used by the Financial Engine.
      coverageAfter =
        cashAfter / Math.max(snapshot.cashCoverageBase, 1);

      assumptions.push(
        `Payment amount assumed to be ₹${formatMoney(outstanding)}.`,
      );

      const budget = snapshot.budget.find(
        (item) => item.categoryId === invoice.categoryId,
      );

      if (budget) {
        const afterCommitted = Math.max(
          budget.committed - outstanding,
          0,
        );

        const afterRemaining = budget.budget - afterCommitted;

        const afterUtilization =
          budget.budget > 0
            ? (afterCommitted / budget.budget) * 100
            : 0;

        budgetImpact = {
          categoryId: budget.categoryId,
          beforeUtilization: budget.utilizationPercent,
          afterUtilization,
          beforeRemaining: budget.remaining,
          afterRemaining,
        };
      }

      break;
    }

    case "PARTIAL_PAYMENT": {
      if (!invoice) {
        throw new Error("Invoice is required for PARTIAL_PAYMENT scenario.");
      }

      if (invoice.status !== "APPROVED" && invoice.status !== "SCHEDULED") {
        throw new Error(
          "Only approved or scheduled invoices can be simulated as payments.",
        );
      }

      const outstanding = Math.max(invoice.total - invoice.paid, 0);
      const payAmount = scenario.amount ?? outstanding;

      if (payAmount <= 0) {
        throw new Error("Partial payment amount must be greater than zero.");
      }

      if (payAmount > outstanding) {
        throw new Error("Partial payment cannot exceed outstanding balance.");
      }

      cashAfter -= payAmount;
      coverageAfter = cashAfter / Math.max(snapshot.cashCoverageBase, 1);

      assumptions.push(
        `Partial payment of ₹${formatMoney(payAmount)} assumed to be paid against ${invoice.invoiceNumber}.`,
      );

      const budget = snapshot.budget.find(
        (item) => item.categoryId === invoice.categoryId,
      );

      if (budget) {
        const afterCommitted = Math.max(budget.committed - payAmount, 0);
        const afterRemaining = budget.budget - afterCommitted;
        const afterUtilization =
          budget.budget > 0 ? (afterCommitted / budget.budget) * 100 : 0;

        budgetImpact = {
          categoryId: budget.categoryId,
          beforeUtilization: budget.utilizationPercent,
          afterUtilization,
          beforeRemaining: budget.remaining,
          afterRemaining,
        };
      }

      break;
    }

    case "APPROVE_INVOICE": {
      if (!invoice) {
        throw new Error("Invoice is required for approval scenario.");
      }

      if (
        invoice.status !== "PENDING_REVIEW" &&
        invoice.status !== "INVESTIGATION" &&
        invoice.status !== "INVESTIGATING" &&
        invoice.status !== "EXTRACTED"
      ) {
        throw new Error(
          "Only invoices pending review can be simulated as approvals.",
        );
      }

      const outstanding = Math.max(invoice.total - invoice.paid, 0);
      postPaymentCash = Math.max(0, snapshot.cash - outstanding);
      postPaymentChange = -outstanding;
      postPaymentCoverage = postPaymentCash / Math.max(snapshot.cashCoverageBase, 1);

      // Approval does not immediately reduce cash.
      // It increases committed financial exposure.
      assumptions.push(
        "Approval is treated as a financial commitment but not as cash movement.",
      );
      assumptions.push(
        `Approval commits ₹${formatMoney(outstanding)}. When settled, cash adjusts from ₹${formatMoney(snapshot.cash)} to ₹${formatMoney(postPaymentCash)}.`,
      );

      const budget = snapshot.budget.find(
        (item) => item.categoryId === invoice.categoryId,
      );

      if (budget) {
        const afterCommitted = budget.committed + outstanding;

        const afterRemaining = budget.budget - afterCommitted;

        const afterUtilization =
          budget.budget > 0
            ? (afterCommitted / budget.budget) * 100
            : 0;

        budgetImpact = {
          categoryId: budget.categoryId,
          beforeUtilization: budget.utilizationPercent,
          afterUtilization,
          beforeRemaining: budget.remaining,
          afterRemaining,
        };

        if (afterRemaining < 0) {
          risks.push({
            level: "HIGH",
            message: `Approval would exceed the category budget by ₹${formatMoney(
              Math.abs(afterRemaining),
            )}.`,
          });
        } else if (afterUtilization >= 90) {
          risks.push({
            level: "MEDIUM",
            message: `Budget utilization would reach ${afterUtilization.toFixed(
              0,
            )}%.`,
          });
        }
      }

      break;
    }

    case "DELAY_PAYMENT": {
      if (!invoice) {
        throw new Error("Invoice is required for DELAY_PAYMENT scenario.");
      }

      const days = scenario.delayDays ?? 30;
      const outstanding = Math.max(invoice.total - invoice.paid, 0);

      // Delaying payment keeps cash in hand during the immediate window
      coverageBaseAfter = Math.max(1, snapshot.cashCoverageBase - outstanding);
      coverageAfter = cashAfter / coverageBaseAfter;

      assumptions.push(
        `Payment of ₹${formatMoney(outstanding)} deferred by ${days} days, preserving near-term liquidity.`,
      );
      break;
    }

    case "RECEIVE_PAYMENT": {
      const amount = scenario.amount ?? 0;

      if (amount <= 0) {
        throw new Error("Receipt amount must be greater than zero.");
      }

      cashAfter += amount;
      coverageAfter = cashAfter / Math.max(snapshot.cashCoverageBase, 1);

      assumptions.push(
        `Receipt of ₹${formatMoney(amount)} assumed to be collected.`,
      );

      break;
    }

    case "CHANGE_BUDGET": {
      if (!scenario.categoryId || scenario.budgetAmount === undefined) {
        throw new Error(
          "categoryId and budgetAmount are required.",
        );
      }

      const budget = snapshot.budget.find(
        (item) => item.categoryId === scenario.categoryId,
      );

      if (!budget) {
        throw new Error("Budget category not found.");
      }

      const afterUtilization =
        scenario.budgetAmount > 0
          ? (budget.committed / scenario.budgetAmount) * 100
          : 0;

      budgetImpact = {
        categoryId: budget.categoryId,
        beforeUtilization: budget.utilizationPercent,
        afterUtilization,
        beforeRemaining: budget.remaining,
        afterRemaining: scenario.budgetAmount - budget.committed,
      };

      assumptions.push(
        `Budget changed from ₹${formatMoney(
          budget.budget,
        )} to ₹${formatMoney(scenario.budgetAmount)}.`,
      );

      break;
    }

    case "ADD_EXPENSE": {
      const amount = scenario.amount ?? 0;
      if (amount <= 0) {
        throw new Error("Expense amount must be greater than zero.");
      }

      cashAfter -= amount;
      coverageAfter = cashAfter / Math.max(snapshot.cashCoverageBase, 1);

      assumptions.push(
        `One-time expense of ₹${formatMoney(amount)} assumed to be incurred.`,
      );

      if (scenario.categoryId) {
        const budget = snapshot.budget.find(
          (b) => b.categoryId === scenario.categoryId,
        );
        if (budget) {
          const afterCommitted = budget.committed + amount;
          const afterRemaining = budget.budget - afterCommitted;
          const afterUtilization =
            budget.budget > 0 ? (afterCommitted / budget.budget) * 100 : 0;
          budgetImpact = {
            categoryId: budget.categoryId,
            beforeUtilization: budget.utilizationPercent,
            afterUtilization,
            beforeRemaining: budget.remaining,
            afterRemaining,
          };
        }
      }
      break;
    }

    case "CHANGE_RECEIVABLE_DATE": {
      const amount = scenario.amount ?? 0;
      assumptions.push(
        `Receivable collection of ₹${formatMoney(amount)} rescheduled.`,
      );
      break;
    }

    default:
      throw new Error("Unsupported scenario.");
  }

  const cashChange = cashAfter - snapshot.cash;

  if (cashAfter < 0) {
    risks.push({
      level: "HIGH",
      message: "Scenario results in negative projected cash.",
    });
  } else if (snapshot.cash > 0 && cashAfter < snapshot.cash * 0.8) {
    risks.push({
      level: "MEDIUM",
      message: "Scenario materially reduces available cash.",
    });
  }

  if (coverageAfter < 1) {
    risks.push({
      level: "HIGH",
      message: "Cash coverage falls below 1.0×.",
    });
  } else if (coverageAfter < 1.5) {
    risks.push({
      level: "MEDIUM",
      message: "Cash coverage becomes relatively tight.",
    });
  }

  if (budgetImpact?.afterUtilization !== undefined) {
    if (budgetImpact.afterUtilization >= 100) {
      risks.push({
        level: "HIGH",
        message: "Budget utilization reaches or exceeds 100%.",
      });
    } else if (budgetImpact.afterUtilization >= 90) {
      risks.push({
        level: "MEDIUM",
        message: "Budget utilization is near its limit.",
      });
    }
  }

  return {
    scenario,

    title: createScenarioTitle(invoice, scenario),

    invoice: invoice
      ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          vendorName: invoice.vendorName,
          amount: Math.max(invoice.total - invoice.paid, 0),
        }
      : undefined,

    impact: {
      cash: {
        before: snapshot.cash,
        change: cashChange,
        after: cashAfter,
        postPaymentCash,
        postPaymentChange,
      },

      cashCoverage: {
        before: currentCoverage,
        after: coverageAfter,
        postPaymentCoverage,
      },

      budget: budgetImpact,

      risks,

      warnings,
    },

    assumptions,

    // VERY IMPORTANT:
    // The simulator never writes to the ledger.
    persisted: false,
  };
}

export function createScenarioTitle(
  invoice: InvoiceForSimulation | undefined,
  scenario: ScenarioInput,
): string {
  switch (scenario.type) {
    case "PAY_INVOICE":
      return invoice
        ? `Pay ${invoice.invoiceNumber} today`
        : "Pay invoice";

    case "PARTIAL_PAYMENT":
      return invoice
        ? `Partial payment on ${invoice.invoiceNumber}`
        : "Partial invoice payment";

    case "APPROVE_INVOICE":
      return invoice
        ? `Approve ${invoice.invoiceNumber}`
        : "Approve invoice";

    case "DELAY_PAYMENT":
      return invoice
        ? `Delay ${invoice.invoiceNumber} by ${scenario.delayDays ?? 30} days`
        : "Delay payment";

    case "RECEIVE_PAYMENT":
      return "Receive customer payment";

    case "CHANGE_BUDGET":
      return "Change budget";

    case "ADD_EXPENSE":
      return "Simulate new expense";

    case "CHANGE_RECEIVABLE_DATE":
      return "Reschedule receivable date";

    default:
      return "Financial scenario";
  }
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}
