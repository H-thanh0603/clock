import { NextResponse, type NextRequest } from "next/server";

/**
 * Guard route /admin* qua backend NestJS riêng (single source of truth).
 * Forward cookie phiên sang backend, chỉ cho role ADMIN đi tiếp.
 * Backend chết/không xác thực được → fail-closed về /login.
 * Đồng thời gắn x-pathname vào request để root layout bỏ header/footer shop.
 */
export async function proxy(req: NextRequest) {
  const next = () => {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", req.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  if (!req.nextUrl.pathname.startsWith("/admin")) return next();
  try {
    const base = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(
      /\/$/,
      ""
    );
    const cookie = req.headers.get("cookie") ?? "";
    const res = await fetch(`${base}/auth/me`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      user?: { role?: string } | null;
    } | null;
    if (!res.ok || !data?.user) {
      return NextResponse.redirect(new URL("/login?next=/admin/orders", req.url));
    }
    if (data.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return next();
  } catch {
    return NextResponse.redirect(new URL("/login?next=/admin/orders", req.url));
  }
}

export const config = { matcher: ["/admin/:path*"] };
