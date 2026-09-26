/** Node HTTP adapter for the built TanStack Start server. No separate backend. */
try {
  process.loadEnvFile?.(".env");
} catch {}
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import app from "./dist/server/server.js";
const root = resolve("dist/client");
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".csv": "text/csv",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  try {
    const host =
      req.headers["x-forwarded-host"] ||
      req.headers.host ||
      `localhost:${process.env.PORT || 3000}`;
    const proto =
      req.headers["x-forwarded-proto"] ||
      (req.headers["x-forwarded-ssl"] === "on" ? "https" : "http");
    const origin = process.env.APP_ORIGIN || `${proto}://${host}`;
    const url = new URL(req.url, origin);

    if (req.headers.origin) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,X-Requested-With",
      );
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (
      (file === root || file.startsWith(root + sep)) &&
      ["GET", "HEAD"].includes(req.method)
    ) {
      try {
        if ((await stat(file)).isFile()) {
          res.writeHead(200, {
            "Content-Type": mime[extname(file)] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": url.pathname.startsWith("/assets/")
              ? "public,max-age=31536000,immutable"
              : "no-cache",
          });
          res.end(req.method === "HEAD" ? undefined : await readFile(file));
          return;
        }
      } catch {}
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) {
        res.writeHead(413);
        res.end("File is too large");
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const request = new Request(url, {
      method: req.method,
      headers,
      ...(!["GET", "HEAD"].includes(req.method)
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    for (const [k, v] of response.headers)
      if (k !== "set-cookie") res.setHeader(k, v);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "private,no-store");
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(
      "Request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("This request could not be completed.");
  }
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(
    `Finance Advisor is running at http://localhost:${process.env.PORT || 3000}`,
  ),
);
