import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, sessionCookie } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim() || null;

    if (!EMAIL_RE.test(email))
      return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
    if (password.length < 6)
      return NextResponse.json(
        { error: "Mật khẩu tối thiểu 6 ký tự" },
        { status: 400 }
      );

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists)
      return NextResponse.json(
        { error: "Email đã được đăng ký" },
        { status: 409 }
      );

    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    const token = await signSession({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    res.headers.set("Set-Cookie", sessionCookie(token));
    return res;
  } catch (e) {
    console.error("POST /api/auth/register failed:", e);
    return NextResponse.json({ error: "Lỗi đăng ký" }, { status: 500 });
  }
}
