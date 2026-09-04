import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { toClientItem } from "@/lib/cart";

/** Gộp giỏ local (khách) vào giỏ DB khi vừa đăng nhập. */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const body = (await req.json()) as {
      items?: {
        slug?: string;
        name: string;
        priceUsd: number;
        priceVnd: number;
        image: string;
        strap?: string;
        engraving?: string;
        qty?: number;
      }[];
    };
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    for (const it of items) {
      const slug = String(it.slug ?? "").trim();
      if (!slug || !it.name) continue;
      const qty = Math.min(99, Math.max(1, Math.floor(Number(it.qty ?? 1))));
      const strap = String(it.strap ?? "Tiêu chuẩn Atelier");
      await prisma.cartItem.upsert({
        where: {
          userId_productSlug_strap: { userId: session.id, productSlug: slug, strap },
        },
        update: { qty: { increment: qty } },
        create: {
          userId: session.id,
          productSlug: slug,
          name: String(it.name).slice(0, 200),
          priceUsd: Math.max(0, Math.floor(Number(it.priceUsd) || 0)),
          priceVnd: Math.max(0, Math.floor(Number(it.priceVnd) || 0)),
          image: String(it.image ?? ""),
          strap,
          engraving: it.engraving ? String(it.engraving).slice(0, 120) : null,
          qty,
        },
      });
    }
    const rows = await prisma.cartItem.findMany({
      where: { userId: session.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(rows.map(toClientItem));
  } catch (e) {
    console.error("POST /api/cart/merge failed:", e);
    return NextResponse.json({ error: "Lỗi gộp giỏ hàng" }, { status: 500 });
  }
}
