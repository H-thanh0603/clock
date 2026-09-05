import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { linePrice } from "@/lib/pricing";

const METHODS = ["centurion", "escrow", "deposit", "vnpay", "cod"] as const;

function orderCode() {
  return `AC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

type ItemInput = {
  slug?: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap?: string;
  engraving?: string;
  qty?: number;
};

/** Tạo đơn từ giỏ. Khách vãng lai vẫn đặt được (userId null). */
export async function POST(req: Request) {
  try {
    const session = await readSession();
    const body = (await req.json()) as {
      customerName?: string;
      contact?: string;
      address?: string;
      slot?: string;
      items?: ItemInput[];
      payment?: { method?: string };
    };

    const customerName = String(body.customerName ?? "").trim();
    const contact = String(body.contact ?? "").trim();
    const address = String(body.address ?? "").trim();
    const slot = body.slot ? String(body.slot) : null;
    const method = String(body.payment?.method ?? "centurion");
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];

    if (!customerName || !contact || !address)
      return NextResponse.json(
        { error: "Thiếu tên, liên lạc hoặc địa chỉ" },
        { status: 400 }
      );
    if (!METHODS.includes(method as (typeof METHODS)[number]))
      return NextResponse.json(
        { error: "Phương thức thanh toán không hợp lệ" },
        { status: 400 }
      );
    if (items.length === 0)
      return NextResponse.json({ error: "Giỏ hàng trống" }, { status: 400 });

    // Chốt giá phía server: sản phẩm có trong DB thì lấy giá DB,
    // hàng bespoke/phụ kiện custom thì giữ giá client gửi.
    const slugs = [...new Set(items.map((i) => String(i.slug ?? "")).filter(Boolean))];
    const rows = await prisma.product.findMany({ where: { slug: { in: slugs } } });
    const priceOf = new Map(rows.map((r) => [r.slug, r]));

    let totalUsd = 0;
    let totalVnd = 0;
    const lines = items.map((i) => {
      const qty = Math.min(99, Math.max(1, Math.floor(Number(i.qty ?? 1))));
      const db = priceOf.get(String(i.slug ?? ""));
      const strap = String(i.strap ?? "Tiêu chuẩn Atelier");
      // Giá gốc USD: DB nếu có, bespoke/phụ kiện thì dùng giá client gửi.
      // VND LUÔN suy ra từ USD × USD_TO_VND — không tin priceVnd client.
      const { priceUsd, priceVnd } = linePrice(
        db ? db.priceUsd : Math.max(0, Math.floor(Number(i.priceUsd) || 0)),
        strap
      );
      totalUsd += priceUsd * qty;
      totalVnd += priceVnd * qty;
      return {
        // Slug chỉ được ghi khi tồn tại trong DB (FK Product.slug);
        // hàng bespoke/phụ kiện custom không có product tương ứng → null.
        productSlug: db ? String(i.slug ?? "") : null,
        name: String(i.name ?? "").slice(0, 200),
        priceUsd,
        priceVnd,
        image: String(i.image ?? ""),
        strap,
        engraving: i.engraving ? String(i.engraving).slice(0, 120) : null,
        qty,
      };
    });
    if (totalUsd <= 0)
      return NextResponse.json({ error: "Tổng đơn không hợp lệ" }, { status: 400 });

    // Mã đơn duy nhất (thử lại nếu đụng)
    let code = orderCode();
    for (let k = 0; k < 5; k++) {
      const dup = await prisma.order.findUnique({ where: { code } });
      if (!dup) break;
      code = orderCode();
    }

    const simulated = method !== "vnpay";
    const order = await prisma.order.create({
      data: {
        code,
        userId: session?.id ?? null,
        customerName: customerName.slice(0, 200),
        contact: contact.slice(0, 200),
        address: address.slice(0, 500),
        slot: slot?.slice(0, 200) ?? null,
        status: simulated ? "CONFIRMED" : "PENDING",
        totalUsd,
        totalVnd,
        items: { create: lines },
        payments: {
          create: {
            method,
            amountUsd: totalUsd,
            status: simulated ? "SUCCESS" : "PENDING",
            txnRef: simulated ? `SIM-${code}` : null,
          },
        },
      },
      include: { items: true },
    });

    // Xóa giỏ DB sau khi chốt đơn (giỏ local do client tự clear)
    if (session) {
      await prisma.cartItem.deleteMany({ where: { userId: session.id } });
    }

    return NextResponse.json({
      orderId: order.id,
      code: order.code,
      totalUsd: order.totalUsd,
      totalVnd: Number(order.totalVnd),
      status: order.status,
    });
  } catch (e) {
    console.error("POST /api/orders failed:", e);
    return NextResponse.json({ error: "Lỗi tạo đơn hàng" }, { status: 500 });
  }
}
