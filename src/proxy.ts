import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

/**
 * Proxy chạy Node.js runtime (Next.js 16) → chặn route /admin*,
 * kiểm tra session cookie, chỉ cho role ADMIN đi tiếp.
 */
export async function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();
  const session = await verifySessionToken(
    req.cookies.get("aurel_session")?.value
  );
  if (!session) {
    return NextResponse.redirect(new URL("/login?next=/admin/orders", req.url));
  }
  if (session.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
