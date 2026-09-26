/**
 * Provider-Configurable AI Layer
 * Feature 44: AI Provider Interface & Gemini Adapter
 *
 * Architecture:
 *   Verified Financial Context
 *             │
 *             ▼
 *        AI Adapter (AIProvider interface)
 *        ┌────┴────┐
 *      Gemini   Future Model
 *        └────┬────┘
 *             ▼
 *      Output Validator
 *             │
 *             ▼
 *      Explanation Only (No numerical invention or state mutations)
 *             │
 *             ▼
 *       Human Decision
 */

import { geminiApiKey, setting } from "../runtime";

export type AIProviderType = "GOOGLE" | "MOCK" | "CUSTOM";

export interface AIExplanationRequest {
  systemPrompt: string;
  contextText: string;
  userPrompt: string;
  calculationIds: string[];
  sourceRecordIds: string[];
  temperature?: number;
}

export interface AIExplanationResult {
  explanation: string;
  citations: string[];
  provider: AIProviderType;
  model: string;
  calculationIds: string[];
  sourceRecordIds: string[];
}

export interface AIDocumentExtractionRequest {
  mime: string;
  dataBase64: string;
}

export interface AIProvider {
  readonly id: AIProviderType;
  readonly name: string;
  readonly defaultModel: string;

  explain(request: AIExplanationRequest): Promise<AIExplanationResult>;
  extractDocument(request: AIDocumentExtractionRequest): Promise<Record<string, any>>;
}

/**
 * Exact Google Gemini model identifier used across the architecture
 */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

/**
 * Google Gemini Provider Implementation
 */
export class GeminiAIProvider implements AIProvider {
  readonly id: AIProviderType = "GOOGLE";
  readonly name = "Google Gemini";

  get defaultModel(): string {
    return setting("GEMINI_MODEL") || setting("AI_MODEL") || DEFAULT_GEMINI_MODEL;
  }

  async explain(request: AIExplanationRequest): Promise<AIExplanationResult> {
    const apiKey = geminiApiKey();
    if (!apiKey) {
      throw new Error("Gemini AI is not connected. Configure GEMINI_API_KEY in the server settings.");
    }

    const model = this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload: any = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `VERIFIED FINANCIAL CONTEXT (READ-ONLY):\n${request.contextText}\n\nUSER QUESTION:\n${request.userPrompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        responseMimeType: "application/json",
      },
    };

    if (request.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => "");
      throw new Error(`Gemini AI service error (${r.status}): ${err || r.statusText}`);
    }

    const data = await r.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("The Gemini AI response was empty.");

    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("The AI response was not valid structured data.");
    }

    return {
      explanation: parsed.explanation || "",
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      provider: "GOOGLE",
      model,
      calculationIds: request.calculationIds,
      sourceRecordIds: request.sourceRecordIds,
    };
  }

  async extractDocument(request: AIDocumentExtractionRequest): Promise<Record<string, any>> {
    const apiKey = geminiApiKey();
    if (!apiKey) {
      throw new Error("Gemini AI is not connected. Configure GEMINI_API_KEY in the server settings.");
    }

    const model = this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemPrompt =
      "You are a specialized financial document extractor. Extract structured fields from the invoice or receipt into JSON matching: { invoice_number: string, vendor_name: string, total_minor: integer_paise, issue_date: YYYY-MM-DD, due_date: YYYY-MM-DD, line_items: [{ description: string, amount_minor: integer_paise }] }. Never guess or invent numbers. If missing, return null.";

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: request.mime,
                data: request.dataBase64,
              },
            },
            {
              text: "Extract invoice financial fields as structured JSON.",
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => "");
      throw new Error(`Gemini Document Extraction error (${r.status}): ${err || r.statusText}`);
    }

    const data = await r.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Document extraction returned empty content.");

    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Deterministic Mock AI Provider for testing and offline development
 */
export class DeterministicMockAIProvider implements AIProvider {
  readonly id: AIProviderType = "MOCK";
  readonly name = "Deterministic Engine Fallback";
  readonly defaultModel = "deterministic-rules-v1.0";

  async explain(request: AIExplanationRequest): Promise<AIExplanationResult> {
    return {
      explanation: `Deterministic explanation based on verified context containing ${request.calculationIds.length} calculations and ${request.sourceRecordIds.length} source records.`,
      citations: request.sourceRecordIds.slice(0, 3),
      provider: "MOCK",
      model: this.defaultModel,
      calculationIds: request.calculationIds,
      sourceRecordIds: request.sourceRecordIds,
    };
  }

  async extractDocument(_request: AIDocumentExtractionRequest): Promise<Record<string, any>> {
    return {
      invoice_number: "DEMO-INV-001",
      vendor_name: "Verified Vendor",
      total_minor: 5000000,
      issue_date: "2026-09-01",
      due_date: "2026-09-30",
    };
  }
}

/**
 * Factory for retrieving the configured AI provider
 */
let customProvider: AIProvider | null = null;

export function setCustomAIProvider(provider: AIProvider | null): void {
  customProvider = provider;
}

export function getAIProvider(): AIProvider {
  if (customProvider) return customProvider;

  const providerType = (setting("AI_PROVIDER") || "GOOGLE").toUpperCase();
  if (providerType === "GOOGLE" || providerType === "GEMINI") {
    return new GeminiAIProvider();
  }

  return new DeterministicMockAIProvider();
}
