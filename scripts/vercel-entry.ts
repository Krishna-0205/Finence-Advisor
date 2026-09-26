import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../dist/server/server.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const host =
      (req.headers["x-forwarded-host"] as string) ||
      req.headers.host ||
      "localhost";
    const proto =
      (req.headers["x-forwarded-proto"] as string) || "https";
    const origin = process.env.APP_ORIGIN || `${proto}://${host}`;
    const url = new URL(req.url || "/", origin);

    if (req.headers.origin) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin as string);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,X-Requested-With,x-tsr-serverfn,x-tsr-transport,traceparent",
      );
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > 16 * 1024 * 1024) {
        res.writeHead(413);
        res.end("File is too large");
        return;
      }
      chunks.push(buf);
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) {
        headers.set(
          k,
          Array.isArray(v)
            ? k.toLowerCase() === "cookie"
              ? v.join("; ")
              : v.join(",")
            : v,
        );
      }
    }

    const hasBody =
      !["GET", "HEAD"].includes(req.method || "GET") && chunks.length > 0;
    const request = new Request(url, {
      method: req.method,
      headers,
      ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
    });

    const response = await app.fetch(request);
    res.statusCode = response.status;
    for (const [k, v] of response.headers) {
      if (k.toLowerCase() !== "set-cookie") res.setHeader(k, v);
    }
    const cookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
    if (cookies.length === 1) {
      res.setHeader("set-cookie", cookies[0]);
    } else if (cookies.length > 1) {
      res.setHeader("set-cookie", cookies);
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "private,no-store");
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(
      "Vercel handler request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("This request could not be completed.");
  }
}
