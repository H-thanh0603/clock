import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { toClientItem } from "@/lib/cart";
import { linePrice } from "@/lib/pricing";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const rows = await prisma.cartItem.findMany({
    where: { userId: session.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows.map(toClientItem));
}

type AddBody = {
  productSlug?: string;
  slug?: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap?: string;
  engraving?: string;
  qty?: number;
};

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const b = (await req.json()) as AddBody;
    const slug = String(b.productSlug ?? b.slug ?? "").trim();
    const name = String(b.name ?? "").trim();
    const image = String(b.image ?? "");
    const strap = String(b.strap ?? "Tiêu chuẩn Atelier");
    const engraving = b.engraving ? String(b.engraving).slice(0, 120) : null;
    const qty = Math.min(99, Math.max(1, Math.floor(Number(b.qty ?? 1))));
    const baseUsd = Math.max(0, Math.floor(Number(b.priceUsd)));
    // Giá chốt server-side: USD gốc + delta strap, VND suy ra — bỏ qua priceVnd client.
    const { priceUsd, priceVnd } = linePrice(baseUsd, strap);
    if (!slug || !name || !Number.isFinite(priceUsd)) {
      return NextResponse.json({ error: "Thiếu thông tin vật phẩm" }, { status: 400 });
    }
    await prisma.cartItem.upsert({
      where: {
        userId_productSlug_strap: { userId: session.id, productSlug: slug, strap },
      },
      update: { qty: { increment: qty }, engraving: engraving ?? undefined },
      create: {
        userId: session.id,
        productSlug: slug,
        name,
        priceUsd,
        priceVnd,
        image,
        strap,
        engraving,
        qty,
      },
    });
    const rows = await prisma.cartItem.findMany({
      where: { userId: session.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(rows.map(toClientItem));
  } catch (e) {
    console.error("POST /api/cart failed:", e);
    return NextResponse.json({ error: "Lỗi thêm vào giỏ" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const b = (await req.json()) as { slug?: string; strap?: string; qty?: number };
    const qty = Math.min(99, Math.max(1, Math.floor(Number(b.qty))));
    const slug = String(b.slug ?? "");
    const strap = String(b.strap ?? "");
    if (!slug || !Number.isFinite(qty)) {
      return NextResponse.json({ error: "Thiếu slug/số lượng" }, { status: 400 });
    }
    await prisma.cartItem.updateMany({
      where: { userId: session.id, productSlug: slug, strap },
      data: { qty },
    });
    const rows = await prisma.cartItem.findMany({
      where: { userId: session.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(rows.map(toClientItem));
  } catch (e) {
    console.error("PATCH /api/cart failed:", e);
    return NextResponse.json({ error: "Lỗi cập nhật giỏ" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  if (searchParams.get("clear") === "1") {
    await prisma.cartItem.deleteMany({ where: { userId: session.id } });
  } else {
    const slug = searchParams.get("slug");
    const strap = searchParams.get("strap") ?? "";
    if (!slug) return NextResponse.json({ error: "Thiếu slug" }, { status: 400 });
    await prisma.cartItem.deleteMany({
      where: { userId: session.id, productSlug: slug, strap },
    });
  }
  const rows = await prisma.cartItem.findMany({
    where: { userId: session.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows.map(toClientItem));
}
