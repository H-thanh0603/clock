/**
 * Logic thuần cho Next route /api/agent/* — proxy server-side các endpoint
 * vận hành của agent host, giữ AGENT_MERCHANT_TOKEN ở phía server.
 *
 * Vì sao cần proxy: token merchant KHÔNG bao giờ được xuống browser
 * (NEXT_PUBLIC_* là public). Route handler verify role ADMIN qua BE
 * /auth/me rồi mới gắn token gọi host. Tách logic thuần ra đây để
 * test được bằng vitest (route handler chỉ là lớp glue mỏng).
 */

/** Endpoint vận hành được phép proxy — kèm method cho phép. */
export const OPS_ROUTES: { prefix: string; methods: string[] }[] = [
  { prefix: "merchant/chat", methods: ["POST"] },
  // GET list changes; POST approve/discard (/merchant/changes/{id}/...).
  { prefix: "merchant/changes", methods: ["GET", "POST"] },
  // Feed ops (scope mặc định). Feed shop (scope=shop) gọi thẳng host, public.
  { prefix: "alerts", methods: ["GET"] },
  { prefix: "shop/monitor/run", methods: ["POST"] },
];

/** Chuẩn hóa sub-path từ catch-all segments. null = path bẩn (traversal). */
export function normalizeSubPath(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null;
  for (const s of segments) {
    const seg = decodeURIComponent(s);
    if (seg === "" || seg === "." || seg === ".." || seg.includes("\\")) {
      return null;
    }
  }
  return segments.map((s) => decodeURIComponent(s)).join("/");
}

/** Sub-path + method có nằm trong allowlist ops không. */
export function isOpsPathAllowed(sub: string | null, method: string): boolean {
  if (!sub) return false;
  const m = method.toUpperCase();
  return OPS_ROUTES.some(
    (r) =>
      (sub === r.prefix || sub.startsWith(`${r.prefix}/`)) &&
      r.methods.includes(m),
  );
}

/** URL upstream tới agent host (giữ nguyên query string của client). */
export function agentUpstreamUrl(host: string, sub: string, query: string): string {
  const base = host.replace(/\/$/, "");
  return `${base}/${sub}${query ? `?${query}` : ""}`;
}
