// D8 perf audit (docs/archive/audit-2-perf.md): a local stand-in for Vercel's
// edge so Lighthouse numbers from a local `next start` are comparable with
// production's. `next start` speaks HTTP/1.1 with gzip; Vercel serves
// HTTP/2 with brotli, and Lighthouse's simulated slow-4G is very sensitive
// to both (≈25 parallel chunks over six HTTP/1.1 connections). Measured
// 2026-11-19: the unchanged build through this proxy gave LCP 3.5–3.9 s on
// public routes vs 3.6/2.7/3.3 s on production itself; without it, 5.3–6.2 s.
//
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=localhost"
//   H2_KEY=key.pem H2_CERT=cert.pem node scripts/perf-h2-proxy.mjs 4100 3100
//   PERF_INSECURE=1 PERF_BASE=https://localhost:4100 node scripts/perf-lighthouse.mjs

import http2 from "node:http2";
import { readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

const [listen, upstream] = process.argv.slice(2).map(Number);
const server = http2.createSecureServer({
  key: readFileSync(process.env.H2_KEY ?? "key.pem"),
  cert: readFileSync(process.env.H2_CERT ?? "cert.pem"),
  allowHTTP1: true,
});
const HOP = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-encoding",
  "content-length", "upgrade", "proxy-connection",
]);
server.on("request", async (req, res) => {
  try {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!k.startsWith(":") && !HOP.has(k) && k !== "host" && k !== "accept-encoding") headers[k] = v;
    }
    const r = await fetch(`http://localhost:${upstream}${req.url}`, { method: req.method, headers, redirect: "manual" });
    const body = Buffer.from(await r.arrayBuffer());
    const out = {};
    r.headers.forEach((v, k) => {
      if (!HOP.has(k)) out[k] = v;
    });
    const type = r.headers.get("content-type") ?? "";
    let payload = body;
    if (/text|javascript|json|css|xml|svg|x-component/.test(type) && body.length > 512 && /br/.test(req.headers["accept-encoding"] ?? "")) {
      payload = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
      out["content-encoding"] = "br";
    }
    out["content-length"] = String(payload.length);
    res.writeHead(r.status, out);
    res.end(payload);
  } catch (e) {
    res.writeHead(502);
    res.end(String(e));
  }
});
server.listen(listen, () => console.log(`h2 proxy :${listen} -> :${upstream}`));
