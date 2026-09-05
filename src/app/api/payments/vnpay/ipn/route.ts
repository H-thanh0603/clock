import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settlePayment } from "@/lib/vnpay";

/** Adapter biến URLSearchParams thành Record (VNPay gửi params qua query). */
function toParams(searchParams: URLSearchParams) {
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => {
    params[k] = v;
  });
  return params;
}

/** IPN server-to-server của VNPay (xác nhận thụ động). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const result = await settlePayment(toParams(searchParams), {
      findPayment: (txnRef) =>
        prisma.payment.findFirst({ where: { txnRef } }),
      getOrder: (orderId) =>
        prisma.order
          .findUnique({ where: { id: orderId } })
          .then((o) => (o ? { code: o.code, totalVnd: Number(o.totalVnd) } : null)),
      updatePayment: (id, status) =>
        prisma.payment.update({ where: { id }, data: { status } }).then(() => undefined),
      updateOrder: (orderId, status) =>
        prisma.order.update({ where: { id: orderId }, data: { status } }).then(() => undefined),
    });

    const byRspCode: Record<string, { RspCode: string; Message: string }> = {
      checksum_fail: { RspCode: "97", Message: "Invalid checksum" },
      payment_not_found: { RspCode: "01", Message: "Order not found" },
      amount_mismatch: { RspCode: "04", Message: "Invalid amount" },
      already_set: { RspCode: "02", Message: "Already confirmed" },
      success: { RspCode: "00", Message: "Confirm Success" },
      unpaid: { RspCode: "00", Message: "Confirm Success" },
    };
    const key = result.outcome.replaceAll("-", "_");
    return NextResponse.json(byRspCode[key]);
  } catch (e) {
    console.error("VNPay IPN failed:", e);
    return NextResponse.json({ RspCode: "99", Message: "Unknown error" });
  }
}
