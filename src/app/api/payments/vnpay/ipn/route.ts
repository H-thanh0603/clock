import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyReturn } from "@/lib/vnpay";

/** IPN server-to-server của VNPay (xác nhận thụ động). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      params[k] = v;
    });
    if (!verifyReturn(params)) {
      return NextResponse.json({ RspCode: "97", Message: "Invalid checksum" });
    }
    const payment = await prisma.payment.findFirst({
      where: { txnRef: params.vnp_TxnRef ?? "" },
    });
    if (!payment) {
      return NextResponse.json({ RspCode: "01", Message: "Order not found" });
    }
    const amountOk =
      Number(params.vnp_Amount ?? 0) / 100 ===
      Number(
        (await prisma.order.findUnique({ where: { id: payment.orderId } }))?.totalVnd ?? -1
      );
    if (!amountOk) {
      return NextResponse.json({ RspCode: "04", Message: "Invalid amount" });
    }
    if (payment.status !== "PENDING") {
      return NextResponse.json({ RspCode: "02", Message: "Already confirmed" });
    }
    const success = params.vnp_ResponseCode === "00";
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
    return NextResponse.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (e) {
    console.error("VNPay IPN failed:", e);
    return NextResponse.json({ RspCode: "99", Message: "Unknown error" });
  }
}
