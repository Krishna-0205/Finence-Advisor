import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/server/seed";
import {
  paginate,
  queryAudit,
  queryLedger,
  queryReceivables,
  queryRisk,
} from "../src/server/lists";
import { advisor, extractDocument } from "../src/server/ai";
import {
  paymentScenario,
  outstanding,
  financialEngine,
} from "../src/server/finance";
import { hostedContext } from "../src/server/runtime";
test("pagination reaches records beyond 200 and filters before pagination", () => {
  const l = seed("test");
  l.audit_logs = Array.from({ length: 260 }, (_, i) => ({
    id: "a" + i,
    company_id: "test",
    created_at: new Date().toISOString(),
    user_id: "admin",
    action: i === 0 ? "TARGET" : "CREATE",
    entity_type: "invoices",
    entity_id: "i" + i,
    previous_state: null,
    new_state: null,
    metadata: {},
  }));
  assert.equal(queryAudit(l, { page: 10 }).rows.length, 10);
  assert.equal(queryAudit(l, { search: "TARGET" }).rows[0].id, "a0");
  assert.equal(paginate([1, 2, 3], Infinity).page, 0);
  assert.equal(paginate([], 999).pages, 1);
  const all = queryLedger(l, {});
  assert.equal(
    all.total,
    l.invoices.length +
      l.payments.length +
      l.receivables.length +
      l.receipts.length,
  );
  assert.equal(queryLedger(l, { type: "PAYMENT" }).total, l.payments.length);
  assert.ok(
    queryReceivables(l, {}).rows.every(
      (r) => r.received_minor <= r.amount_minor,
    ),
  );
  assert.ok(
    queryRisk(l, { severity: "HIGH" }).rows.every((r) => r.severity === "HIGH"),
  );
});
test("advisor scopes evidence to budget and horizon; unknown questions do not invent data", async () => {
  const l = seed("test");
  const budget = await advisor(
    l,
    "Which category is closest to its budget limit?",
  );
  assert.equal(budget.intent, "budget");
  assert.ok(budget.budget_details.length);
  const cash = await advisor(l, "What is projected cash in 90 days?");
  assert.equal(cash.horizon, 90);
  assert.equal(
    cash.calculation.projected,
    financialEngine(l).projections[3].cash,
  );
  const unknown = await advisor(l, "What is the current price of gold?");
  assert.equal(unknown.intent, "unknown");
  assert.match(unknown.explanation, /does not identify/);
  const invoice = l.invoices[0];
  const result = await advisor(
    l,
    "What happens if this invoice is paid?",
    invoice.id,
  );
  assert.equal(result.scenario?.outstanding, outstanding(l, invoice));
  assert.deepEqual(result.scenario, paymentScenario(l, invoice));
});
test("AI rejects invented numeric text and unknown record citations", async () => {
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                explanation: "Cash will be 9999 rupees",
                citations: ["invented-invoice"],
              }),
            },
          },
        ],
      }),
    );
  };
  try {
    const result = await hostedContext.run(
      {
        user: "test",
        env: {
          AI_API_KEY: "test",
          AI_BASE_URL: "https://example.test/v1",
          AI_MODEL: "requested-model",
        },
      },
      () => advisor(seed("test"), "Why is cash changing?"),
    );
    assert.equal(calls, 1);
    assert.equal(result.mode, "Verified explanation");
    assert.ok(!result.explanation.includes("9999"));
    assert.ok(!result.citations.includes("invented-invoice"));
    assert.match(result.notice, /validation failed/);
  } finally {
    globalThis.fetch = old;
  }
});

test("document extraction rejects malformed objects and unsupported currencies", async () => {
  const old = globalThis.fetch;
  const env = {
    AI_API_KEY: "test",
    AI_BASE_URL: "https://example.test/v1",
    AI_MODEL: "requested-model",
  };
  try {
    for (const output of [
      { vendor: { bad: true } },
      { vendor: "Supplier", currency: "USD" },
    ]) {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output) } }],
          }),
        );
      await assert.rejects(
        hostedContext.run({ user: "test", env }, () =>
          extractDocument("test", "application/pdf"),
        ),
      );
    }
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  vendor: "Supplier",
                  currency: "INR",
                  total: "100.00",
                }),
              },
            },
          ],
        }),
      );
    const result = await hostedContext.run({ user: "test", env }, () =>
      extractDocument("test", "application/pdf"),
    );
    assert.equal(result.total, "100.00");
    assert.equal(result.subtotal, null);
  } finally {
    globalThis.fetch = old;
  }
});

test("Gemini AI integration formats request, validates citations, and extracts documents", async () => {
  const old = globalThis.fetch;
  const l = seed("test");
  const invoice = l.invoices[0];
  let requestedUrl = "";
  let requestBody: any = null;

  globalThis.fetch = async (url: any, opts: any) => {
    requestedUrl = String(url);
    requestBody = JSON.parse(opts.body);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    explanation: "Payments exceed collections in this projection window.",
                    citations: [invoice.id],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  };

  try {
    const env = {
      GEMINI_API_KEY: "test-gemini-key",
      GEMINI_MODEL: "gemini-1.5-flash",
    };

    const res = await hostedContext.run({ user: "test", env }, () =>
      advisor(l, "Why is projected cash changing?"),
    );

    assert.ok(requestedUrl.includes("generativelanguage.googleapis.com"));
    assert.ok(requestedUrl.includes("gemini-1.5-flash"));
    assert.ok(requestedUrl.includes("key=test-gemini-key"));
    assert.equal(res.mode, "Gemini AI explanation");
    assert.equal(res.citations[0], invoice.id);
    assert.equal(
      res.explanation,
      "Payments exceed collections in this projection window.",
    );

    // Multimodal document extraction with Gemini
    globalThis.fetch = async (url: any, opts: any) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(opts.body);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      vendor: "Gemini Supplies Ltd",
                      invoice_number: "GEM-9001",
                      currency: "INR",
                      total: "5420.00",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    };

    const docResult = await hostedContext.run({ user: "test", env }, () =>
      extractDocument("samplebase64data", "application/pdf"),
    );

    assert.equal(docResult.vendor, "Gemini Supplies Ltd");
    assert.equal(docResult.invoice_number, "GEM-9001");
    assert.equal(docResult.total, "5420.00");
    // Verify inlineData was sent
    const userParts = requestBody.contents[0].parts;
    const inlinePart = userParts.find((p: any) => p.inlineData);
    assert.ok(inlinePart, "Gemini should receive inlineData for document");
    assert.equal(inlinePart.inlineData.mimeType, "application/pdf");
    assert.equal(inlinePart.inlineData.data, "samplebase64data");
  } finally {
    globalThis.fetch = old;
  }
});

