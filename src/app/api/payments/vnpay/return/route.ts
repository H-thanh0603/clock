import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settlePayment } from "@/lib/vnpay";

/** VNPay redirect người dùng về đây sau thanh toán. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  try {
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      params[k] = v;
    });

    const result = await settlePayment(params, {
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

    const toOrderUrl = (paid: boolean, reason?: string) => {
      const code = "code" in result ? result.code : "";
      const base = `${origin}/orders/${code}`;
      return `${base}?paid=${paid ? "1" : "0"}${reason ? `&reason=${reason}` : ""}`;
    };

    switch (result.outcome) {
      case "success":
        return NextResponse.redirect(toOrderUrl(true));
      case "already-set":
        return result.settled
          ? NextResponse.redirect(toOrderUrl(true))
          : NextResponse.redirect(toOrderUrl(false, "already"));
      case "unpaid":
        return NextResponse.redirect(toOrderUrl(false, "unpaid"));
      case "payment-not-found":
        return NextResponse.redirect(toOrderUrl(false, "payment"));
      case "amount-mismatch":
        return NextResponse.redirect(toOrderUrl(false, "amount"));
      case "checksum-fail":
      default:
        return NextResponse.redirect(toOrderUrl(false, "checksum"));
    }
  } catch (e) {
    console.error("VNPay return failed:", e);
    return NextResponse.redirect(`${origin}/checkout?paid=0`);
  }
}
