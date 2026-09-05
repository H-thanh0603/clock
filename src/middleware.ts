import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

/**
 * Middleware chạy edge runtime → dùng lõi session edge-safe
 * (lib/session) thay vì lib/auth (kéo next/headers + bcrypt).
 */
export async function middleware(req: NextRequest) {
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
