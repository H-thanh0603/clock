import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { buildPayUrl } from "@/lib/vnpay";

/** Tạo URL thanh toán VNPay cho đơn vừa chốt. */
export async function POST(req: Request) {
  try {
    const session = await readSession();
    const body = (await req.json()) as { orderId?: string };
    if (!body.orderId)
      return NextResponse.json({ error: "Thiếu orderId" }, { status: 400 });

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) return NextResponse.json({ error: "Không thấy đơn" }, { status: 404 });
    if (order.userId && order.userId !== session?.id)
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    if (order.status === "CANCELLED")
      return NextResponse.json({ error: "Đơn đã hủy" }, { status: 400 });

    const origin = new URL(req.url).origin;
    const txnRef = `${order.code}-${Date.now().toString().slice(-6)}`;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "vnpay",
        amountUsd: order.totalUsd,
        status: "PENDING",
        txnRef,
      },
    });
    const url = buildPayUrl({
      txnRef,
      amountVnd: Number(order.totalVnd),
      orderInfo: `Thanh toan don ${order.code} Aurel Co`,
      returnUrl: `${origin}/api/payments/vnpay/return`,
      ipAddr:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    });
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi tạo thanh toán VNPay";
    console.error("POST /api/payments/vnpay/create failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
