import { AsyncLocalStorage } from "node:async_hooks";
export type HostedContext = { env: Record<string, any>; user: string };
const runtime = globalThis as typeof globalThis & {
  __financeHostedContext?: AsyncLocalStorage<HostedContext>;
};
export const hostedContext = (runtime.__financeHostedContext ??=
  new AsyncLocalStorage<HostedContext>());
export const hosted = () => hostedContext.getStore();
export const setting = (key: string) => {
  const val = hosted()?.env[key] ?? process.env[key];
  if (typeof val === "string") {
    return val.trim().replace(/^["']|["']$/g, "").trim();
  }
  return val;
};
export const geminiApiKey = () => {
  const h = hosted();
  const raw = h
    ? (h.env.GEMINI_API_KEY || (h.env.AI_API_KEY?.startsWith("AIza") ? h.env.AI_API_KEY : undefined))
    : (setting("GEMINI_API_KEY") || (setting("AI_API_KEY")?.startsWith("AIza") ? setting("AI_API_KEY") : undefined));
  if (!raw || typeof raw !== "string") return undefined;
  const clean = raw.trim().replace(/^["']|["']$/g, "").trim();
  return clean || undefined;
};
export const aiConfigured = () =>
  !!(
    geminiApiKey() ||
    (setting("AI_API_KEY") && setting("AI_BASE_URL") && setting("AI_MODEL"))
  );
export const aiProvider = (): "gemini" | "openai" | "none" =>
  geminiApiKey() ? "gemini" : aiConfigured() ? "openai" : "none";

