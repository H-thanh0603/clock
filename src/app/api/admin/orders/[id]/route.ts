import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";

const STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
] as const;

async function requireAdmin() {
  const session = await readSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  return user?.role === "ADMIN" ? user : null;
}

/** Đổi trạng thái đơn (chỉ ADMIN). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  try {
    const { id } = await params;
    const body = (await req.json()) as { status?: string };
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json(
        { error: "Trạng thái không hợp lệ" },
        { status: 400 }
      );
    }
    const order = await prisma.order.update({
      where: { id },
      data: { status: body.status as (typeof STATUSES)[number] },
    });
    return NextResponse.json({ id: order.id, status: order.status });
  } catch (e) {
    console.error("PATCH /api/admin/orders failed:", e);
    return NextResponse.json({ error: "Lỗi cập nhật đơn" }, { status: 500 });
  }
}
