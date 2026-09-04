import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyReturn } from "@/lib/vnpay";

async function settle(searchParams: URLSearchParams) {
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => {
    params[k] = v;
  });
  if (!verifyReturn(params)) return { ok: false as const, reason: "checksum" };
  const txnRef = params.vnp_TxnRef ?? "";
  const success = params.vnp_ResponseCode === "00";
  const payment = await prisma.payment.findFirst({ where: { txnRef } });
  if (!payment) return { ok: false as const, reason: "payment" };
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: success ? "SUCCESS" : "FAILED" },
  });
  if (success) {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: "PAID" },
    });
  }
  const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
  return { ok: success, code: order?.code ?? "" };
}

/** VNPay redirect người dùng về đây sau thanh toán. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  try {
    const r = await settle(searchParams);
    if (r.ok) {
      return NextResponse.redirect(
        `${origin}/orders/${r.code}?paid=1`
      );
    }
    const code = r.code || "";
    return NextResponse.redirect(
      `${origin}/orders/${code}?paid=0&reason=${r.reason}`
    );
  } catch (e) {
    console.error("VNPay return failed:", e);
    return NextResponse.redirect(`${origin}/checkout?paid=0`);
  }
}
