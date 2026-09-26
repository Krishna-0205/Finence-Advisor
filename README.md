# Finance Advisor

A high-assurance, production-grade financial workspace built with **TanStack Start**, **React 19**, **TypeScript**, and **Google Gemini AI (`gemini-2.5-flash`)**. 

Finance Advisor is engineered around a core architectural invariant: **The Financial Engine is the sole mathematical authority**. All monetary amounts are computed deterministically in integer paise (₹1 = 100 paise) with zero floating-point drift, full data lineage, immutable audit logging, and NIST AI RMF 1.0 verified governance.

---

## 🚀 Key Architecture & Feature Highlights

### 1. Provider-Configurable AI Layer & Governance (Features 44 & 45)
* **Google Gemini AI Integration**: Powered by default by `gemini-2.5-flash` via a provider-configurable `AIProvider` interface (`GeminiAIProvider`, `DeterministicMockAIProvider`), cleanly decoupling AI providers from business logic.
* **Engine Precedence Guarantee**: AI is strictly read-only and restricted to financial explanation, document field extraction, and natural-language Q&A. The deterministic financial engine computes all numbers.
* **NIST AI RMF 1.0 Compliance**: 100 versioned test cases validating 100% pass rate, 0% hallucinations, 0% source-attribution error, and 0% prompt injection bypass.
* **AI Governance Dashboard (`/governance`)**: Live telemetry of model identifier, token usage, guardrails status, benchmark verification, and real-time verifiable AI audit events.
* **Immutable AI Audit Trail**: Every AI request is logged with `companyId`, `userId`, `model`, `calculationIds`, `sourceRecordIds`, security verdicts, and response latency without storing raw sensitive context.

### 2. Financial Controls & Security Layer (Features 29 – 35)
* **Feature 29 · Metric Freshness Lineage**: First-class `DataFreshness` (`FRESH`, `AGING`, `STALE`) attached to all KPIs with relative age ("updated just now") and explicit generation/as-of timestamps.
* **Feature 30 · Financial Reconciliation Center**: Evaluates fundamental balance equation (`Current Cash + Receivables - Payables`), detecting overpayments, duplicate payments, and unmatched receipts.
* **Feature 31 · Immutable Audit Events**: Structured records tracking WHO, WHAT, WHEN, WHERE, WHY, BEFORE, and AFTER for all financial mutations with cryptographic SHA-256 hash chaining.
* **Feature 32 · Step-Up MFA for Admins**: Enforces multi-factor verification on high-value actions (invoices & payments $\ge$ ₹5,00,000).
* **Feature 33 · Security Event Dashboard**: Continuous OWASP ASVS 5.0 monitoring of authentication, authorization, export downloads, and privilege escalation.
* **Feature 34 · Export Controls & RBAC**: Role-based access controls (Admin, Finance, Viewer) governing sanitized ledger and audit report exports.
* **Feature 35 · Multi-Layer Rate Limiting**: Sliding-window rate limiters protecting authentication, mutations, and AI calls from abuse.

### 3. Production Platform Layer (Features 36 – 43)
* **Feature 36 · Database Performance & Caching**: Keyset cursor pagination and TTL-based analytical cache for responsive, high-volume ledger queries.
* **Feature 37 · Idempotent Background Job Execution**: Lock-protected background workers with idempotency keys preventing duplicate processing of financial tasks.
* **Feature 38 · In-App Notification Center**: Real-time bell popover with unread indicators, categories (URGENT, RISK, WORKFLOW), and mark-as-read state.
* **Feature 39 · "Today's Priorities" Smart Alert Prioritization**: Deterministic scoring (1–100) ranking daily obligations based on financial impact, urgency, and confidence.
* **Feature 40 · "Why Now?" 4-Question Decision Framework**: Structured action cards detailing *(1) Why This? (2) Why Now? (3) Cost of Inaction, (4) Recommended Action*.
* **Feature 41 · Versioned Financial Policy Engine**: Tenant-configurable, immutable policies (`approval-policy-v1.x`) defining cash warning thresholds, overdue days, and approval limits.
* **Feature 42 · "Explain This Number" 3-Level Lineage**: Interactive drill-down modal offering:
  * *Level 1*: Executive Summary & Business Meaning
  * *Level 2*: Mathematical Formula & Step-by-Step Calculation Breakdown
  * *Level 3*: Cryptographically Traceable Source Records & Invoices
* **Feature 43 · Financial Data Health Dashboard**: 5-dimension automated audit (Completeness, Timeliness, Reconciliation, Anomaly, Integrity) with one-click issue resolution.

### 4. Advanced Financial Operations & Forecasting (Features 19 – 28)
* **Customer Payment Behavior & DSO**: Historical payment velocity, on-time collection rates, and receivables delay modeling.
* **Vendor Intelligence & Concentration**: Vendor risk scoring, duplicate invoice detection, payment terms, and single-supplier dependency alerts.
* **Spend Concentration**: Multi-dimensional breakdown across Vendor, Category, and Department.
* **Collections Intelligence**: Aging buckets (0-30d, 31-60d, 61-90d, 90d+) with urgent recovery callouts.
* **30-Day Multi-Scenario Cash Forecasting**: Deterministic *Base Case*, *Conservative Stress Test*, and *Optimistic Liquidity* models.
* **IAS 7 Cash Flow Semantics**: Operating, Investing, and Financing activity classification with cash bridge reconciliations.
* **Maker-Checker Segregation of Duties**: Enforces that invoice creators cannot approve their own obligations.
* **Payment Timing Simulation**: Evaluates trade-offs between paying today vs delaying (+7d, +15d, +30d) vs prompt-payment discounts.

---

## 🛠️ Technology Stack

* **Framework**: [TanStack Start](https://tanstack.com/start) (Full-stack React with SSR & Server Functions)
* **Runtime**: Node.js 22.12+ (tested with Node 24.13.1)
* **UI & Styling**: React 19, Vanilla CSS Design System with Tailwind CSS v4, Lucide React icons
* **Database & ORM**: PostgreSQL with Row-Level Security (RLS) & RPC functions, Drizzle ORM, PGlite (embedded WASM for tests)
* **AI Provider**: Google Gemini (`gemini-2.5-flash`), with deterministic mock provider fallback
* **Testing**: Node.js Native Test Runner (`node:test`) + `tsx`, 84 automated unit and integration tests

---

## 🏁 Getting Started

### 1. Prerequisites
* **Node.js** 22.12 or newer (Node 24 recommended)
* **npm** 10+

### 2. Installation & Setup   
```bash
# Clone and install dependencies
npm ci

# Configure environment variables
cp .env.example .env

# Generate a secure session secret
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
# Paste the generated secret as SESSION_SECRET in .env
```

### 3. Running Locally (Demo Mode)
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser. 
Select **Open demo workspace** or choose between **Admin**, **Finance**, or **Viewer** role simulations. The local demo runs in-memory with isolated file-backed workspaces under `.data/`.

---

## 📦 Production Deployment & Verification

```bash
# 1. Typecheck the codebase
npm run typecheck

# 2. Run the 84-test verification suite
npm test

# 3. Build optimized production client & SSR server
npm run build

# 4. Start production server
npm start
```
The application will listen on port `3000` (or `process.env.PORT`).

---

## 🧪 Verification & Automated Testing

The repository contains an exhaustive test suite covering all layers:

| Test Suite | Focus Area | Status |
| :--- | :--- | :---: |
| `tests/ai-governance-and-audit.test.ts` | Gemini configuration, Engine precedence, NIST guardrails, Audit logging | ✅ Pass |
| `tests/evaluator.test.ts` | 100 NIST AI RMF test cases (hallucinations, prompt injections, citations) | ✅ Pass |
| `tests/platform-features.test.ts` | Features 36–43 (Pagination, Jobs, Notifications, Priorities, Policy, Explain) | ✅ Pass |
| `tests/security.test.ts` | Freshness, Reconciliation, MFA, Audit events, Rate limits, Export controls | ✅ Pass |
| `tests/financial-operations.test.ts` | Customer behavior, Vendor intelligence, Spend concentration, Collections | ✅ Pass |
| `tests/operations.test.ts` | Maker-checker SoD, IAS 7 cash flow, Payment scheduling & timing simulation | ✅ Pass |
| `tests/database.test.ts` | PostgreSQL RLS, cross-company foreign keys, atomic CAS rollback | ✅ Pass |
| `tests/cash-flow-drivers.test.ts` | Deterministic cash flow driver classification & ranking | ✅ Pass |
| `tests/lineage-kpis.test.ts` | Mathematical calculation lineage & source record tracking | ✅ Pass |
| **Total** | **84 tests across 14 suites** | **100% Passing** |

---

## 🔒 Financial Integrity Guarantees

1. **Integer Paise Precision**: All currency math uses whole numbers (`₹1 = 100 paise`). Floating point multiplication and division are strictly avoided in storage and calculation.
2. **Approval Is Not Payment**: Approving an invoice reserves funds from available budget commitments, but current cash only decrements when payment is confirmed.
3. **Cumulative Horizons**: Cash projections calculate cumulative liquidity across 30, 60, and 90-day intervals, factoring in scheduled dates over invoice due dates.
4. **Non-Mutating Simulations**: What-If scenario simulations (pay invoice, delay payment, change budget) clone active ledger state and evaluate projected cash without committing database transactions.
5. **Maker-Checker Segregation**: An invoice created by a user cannot be approved by that same user; an independent reviewer must authorize the transaction.

---

## 📂 Project Directory Structure

```
├── src/
│   ├── components/         # Reusable UI cards, modals, navigation & layout
│   │   ├── financial/      # Domain cards (Forecast, Reconciliation, Spend, Timing, etc.)
│   │   ├── governance/     # AI Governance dashboard & NIST telemetry
│   │   └── platform/       # Explain modal, Priorities, Why Now, Health cards
│   ├── domain/             # Core financial models, policies, and types
│   │   ├── finance/        # Financial engine, cash flow, lineage, freshness
│   │   └── platform/       # Policies, notifications, jobs, data health
│   ├── pages/              # TanStack Start product page components
│   ├── routes/             # File-based router definitions & loaders
│   ├── server/             # Server functions, AI adapters, DB & security controllers
│   │   ├── ai/             # Provider-configurable AI layer & audit store
│   │   ├── finance/        # Financial calculations & collections intelligence
│   │   ├── platform/       # Policy store, background jobs, caching
│   │   └── security/       # Rate limiting, MFA step-up, export controller
│   └── styles.css          # Design system, high-contrast buttons, responsive layout
├── database/               # PostgreSQL schema migrations (RLS, constraints, RPCs)
├── tests/                  # Automated test suites (84 passing unit/integration tests)
└── scripts/                # Build workers and verification scripts
```

---

## 📄 License

Proprietary & Confidential. All rights reserved.
