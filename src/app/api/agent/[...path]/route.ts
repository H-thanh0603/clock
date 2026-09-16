import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import {
  agentUpstreamUrl,
  isOpsPathAllowed,
  normalizeSubPath,
} from "@/lib/agent-proxy";
import { apiUrl } from "@/lib/api-client";

/**
 * Proxy server-side cho endpoint VẬN HÀNH của agent host
 * (/merchant/*, feed ops, monitor/run).
 *
 * Hai lớp bảo vệ (audit SEC-CRIT-01):
 * 1. Verify role ADMIN qua BE /auth/me bằng cookie của chính caller —
 *    không phải admin thì dừng ở đây (kể cả khi cầm được URL).
 * 2. AGENT_MERCHANT_TOKEN chỉ sống ở env server (process.env), gắn vào
 *    header gọi host — KHÔNG BAO GIỜ xuống browser.
 *
 * Endpoint shop công khai (shop/chat, feed scope=shop) KHÔNG đi qua đây —
 * browser gọi thẳng agent host như cũ.
 */

async function isAdmin(): Promise<boolean> {
  try {
    const cookie = (await cookies()).toString();
    const res = await fetch(apiUrl("/auth/me"), {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      user?: { role?: string } | null;
    } | null;
    return res.ok && data?.user?.role === "ADMIN";
  } catch {
    return false;
  }
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
  body?: ArrayBuffer | null,
) {
  const { path } = await ctx.params;
  const sub = normalizeSubPath(path);
  if (!isOpsPathAllowed(sub, req.method)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isAdmin())) {
    return Response.json({ error: "Khu vực vận hành — cần quyền admin" }, { status: 403 });
  }
  const host =
    process.env.AGENT_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_AGENT_URL ??
    "http://127.0.0.1:8100";
  const qs = req.nextUrl.search ? req.nextUrl.search.slice(1) : "";
  const upstream = await fetch(
    agentUpstreamUrl(host, sub as string, qs),
    {
      method: req.method,
      headers: {
        "content-type":
          req.headers.get("content-type") ?? "application/json",
        ...(process.env.AGENT_MERCHANT_TOKEN
          ? { "x-agent-token": process.env.AGENT_MERCHANT_TOKEN }
          : {}),
      },
      body: body ?? undefined,
      // SSE/chat turn dài (multi tool-call) — không cắt giữa chừng.
      signal: req.signal,
    },
  );
  // Stream nguyên body upstream (SSE) về browser, giữ status + content-type.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const buf = await req.arrayBuffer().catch(() => null);
  return proxy(req, ctx, buf && buf.byteLength > 0 ? buf : null);
}
