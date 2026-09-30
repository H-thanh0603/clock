import { headers } from "next/headers";
import { buildAgentManifest } from "@/lib/agent-manifest";

/** GET /.well-known/agent — Agent Manifest (JSON tĩnh, không auth). */
export async function GET() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  // KHÔNG đọc x-forwarded-host — client/proxy trước đó tự đặt được, manifest
  // cache 1h sẽ đầu độc mọi agent đọc nó. Host header (do Caddy set) là đủ.
  const host = h.get("host") ?? "localhost:3100";
  const base =
    process.env.SITE_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;
  return Response.json(buildAgentManifest(base), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
