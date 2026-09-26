import { hosted, setting } from "./runtime";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestHeader,
} from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type { Actor, Role } from "../domain/types";
import { cloud, isDemo, createDemo } from "./store";

const DEFAULT_SESSION_SECRET =
  "finance-advisor-production-secure-session-key-at-least-32-chars-long";

function secret() {
  const s = setting("SESSION_SECRET");
  if (s && typeof s === "string" && s.length >= 32) return s;
  if (s && typeof s === "string" && s.length > 0) {
    return createHash("sha256").update(s).digest("hex");
  }
  return DEFAULT_SESSION_SECRET;
}
type Session = {
  site_user?: string;
  mode: "demo" | "cloud";
  company_id?: string;
  token?: string;
  user_id?: string;
  name?: string;
  role?: Role;
  exp: number;
};
function write(s: Session) {
  const payload = Buffer.from(
    JSON.stringify({ ...s, site_user: hosted()?.user }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  const isHttps =
    setting("APP_ORIGIN")?.startsWith("https://") ||
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.K_SERVICE || process.env.K_REVISION) ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.RENDER) ||
    !!hosted();
  const sameSite =
    process.env.VERCEL || process.env.RENDER || setting("APP_ORIGIN")?.includes("onrender.com")
      ? "lax"
      : isHttps
        ? "none"
        : "lax";
  setCookie("finance_session", payload + "." + signature, {
    httpOnly: true,
    secure: isHttps,
    sameSite,
    path: "/",
    maxAge: 7 * 86400,
  });
}
function read(): Session | null {
  try {
    let raw = getCookie("finance_session");
    if (!raw) {
      try {
        const cookieHeader = getRequestHeader("cookie");
        if (cookieHeader) {
          const match = cookieHeader.match(/(?:^|;\s*)finance_session=([^;]+)/);
          if (match) raw = decodeURIComponent(match[1]);
        }
      } catch {}
    }
    if (!raw) return null;
    const [body, sig] = raw.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(sig, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return null;
    const s = JSON.parse(Buffer.from(body, "base64url").toString());
    if (hosted() && s.site_user !== hosted()!.user) return null;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
export async function actor(sessionOverride?: Session): Promise<Actor> {
  const s = sessionOverride || read();
  if (!s) {
    if (isDemo()) {
      return {
        user_id: "demo-admin",
        company_id: "demo-default",
        role: "admin",
        name: "Alex Morgan",
        mode: "demo",
      };
    }
    throw new Error("Sign in to continue.");
  }
  if (s.mode === "demo") {
    if (!isDemo()) throw new Error("Demo access is disabled.");
    return {
      user_id: s.user_id || "demo-admin",
      company_id: s.company_id || "demo-default",
      role: s.role || "admin",
      name: s.name || "Alex Morgan",
      mode: "demo",
    };
  }
  const db = cloud();
  const { data, error } = await db.auth.getUser(s.token);
  if (error || !data.user)
    throw new Error("Session expired. Please sign in again.");
  const admin = cloud(true);
  let q = admin.from("user_roles").select("*").eq("user_id", data.user.id);
  if (s.company_id) q = q.eq("company_id", s.company_id);
  const { data: roles, error: roleError } = await q.limit(1);
  if (roleError) throw new Error("Could not check company membership.");
  if (!roles?.length) {
    const { error } = await admin.rpc("finance_onboard", {
      p_user: data.user.id,
      p_name: data.user.user_metadata.full_name || "Administrator",
      p_email: data.user.email || "",
      p_company_name: data.user.user_metadata.company_name || "My Company",
    });
    if (error)
      throw new Error(
        "Company setup could not be completed. Contact your administrator.",
      );
    return actor(s);
  }
  return {
    user_id: data.user.id,
    company_id: roles[0].company_id,
    role: roles[0].role,
    name:
      data.user.user_metadata.full_name || data.user.email || "Finance user",
    mode: "cloud",
  };
}
export async function signIn(email: string, password: string) {
  const { data, error } = await cloud().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session)
    throw new Error("Could not sign in. Check your email and password.");
  const session: Session = {
    mode: "cloud",
    token: data.session.access_token,
    exp: Date.now() + Math.min(data.session.expires_in, 3600) * 1000,
  };
  write(session);
  return actor(session);
}
export async function demoLogin(role: Role) {
  if (!isDemo() || !["admin", "finance", "viewer"].includes(role))
    throw new Error("Demo access is disabled.");
  const old = read();
  const company_id =
    old?.mode === "demo" ? old.company_id! : await createDemo();
  const session: Session = {
    mode: "demo",
    company_id,
    user_id: "demo-" + role,
    name: role === "admin" ? "Alex Morgan" : "Demo " + role,
    role,
    exp: Date.now() + 7 * 86400 * 1000,
  };
  write(session);
  return actor(session);
}
export async function companies() {
  const a = await actor();
  if (a.mode === "demo")
    return [{ id: a.company_id, name: "NovaTech Solutions Pvt. Ltd." }];
  const { data, error } = await cloud(true)
    .from("user_roles")
    .select("company_id,companies(id,name)")
    .eq("user_id", a.user_id);
  if (error) throw new Error("Could not load companies.");
  return data.map((r: any) => r.companies);
}
export async function switchCompany(id: string) {
  const a = await actor();
  const allowed = await companies();
  if (!allowed.some((c) => c.id === id))
    throw new Error("Company access denied.");
  const s = read()!;
  write({ ...s, company_id: id });
  return actor({ ...s, company_id: id });
}
export function signOut() {
  deleteCookie("finance_session", { path: "/" });
}
