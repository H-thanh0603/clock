import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { MeiliService } from '../search/meili.service';
import { linePrice } from '../common/pricing';
import { auditEvent, productDiff } from './product-audit';

/**
 * Cụm Listing của backoffice (CONTEXT.md: Listing, CPO) — CRUD sản phẩm,
 * validate CPO chặt, sync Meili, ghi ProductEvent audit.
 */
@Injectable()
export class AdminListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly meili: MeiliService,
  ) {}

  /** Danh sách SP cho backoffice — thấy cả SP ẩn (inBoutique=false). */
  async listProducts(
    page = 1,
    limit = 20,
    q?: string,
    includeHidden = true,
  ) {
    return this.products.list(
      {
        q,
        page,
        limit,
        sort: 'newest',
      },
      { includeHidden },
    );
  }

  /** Tạo sản phẩm mới (priceVnd suy ra từ priceUsd — không nhận từ client). */
  async createProduct(body: Record<string, unknown>, byUserId?: string) {
    const slug = String(body.slug ?? '').trim();
    const name = String(body.name ?? '').trim();
    const reference = String(body.reference ?? '').trim();
    const priceUsd = Math.max(0, Math.floor(Number(body.priceUsd) || 0));
    if (!slug || !name || !reference || priceUsd <= 0)
      throw new BadRequestException('Thiếu slug/tên/reference/giá');
    const dup = await this.prisma.product.findFirst({
      where: { OR: [{ slug }, { reference }] },
    });
    if (dup) throw new ConflictException('Slug hoặc reference đã tồn tại');
    const str = (v: unknown, max = 500) => String(v ?? '').slice(0, max);
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)) : [];
    const { priceVnd } = linePrice(priceUsd, null);
    const stock = Math.max(0, Math.floor(Number(body.stock ?? 1)));
    const row = await this.prisma.product.create({
      data: {
        slug,
        name: name.slice(0, 200),
        reference,
        collection: str(body.collection, 100) || 'classic',
        priceUsd,
        priceVnd,
        stock,
        shortDescription: str(body.shortDescription, 2000),
        badges: strArr(body.badges),
        strapLabel: str(body.strapLabel, 200),
        cardImage: str(body.cardImage),
        images: strArr(body.images),
        calibre: str(body.calibre, 200),
        diameterMm: Number(body.diameterMm) || 0,
        caseMaterial: str(body.caseMaterial, 200),
        complications: strArr(body.complications),
        inBoutique: body.inBoutique !== false,
        specs:
          (body.specs as { label: string; value: string }[] | undefined) ?? [],
        narrative: str(body.narrative, 5000),
      },
    });
    await auditEvent(this.prisma, {
      slug,
      action: 'CREATE',
      byUserId,
      summary: `${name} • $${priceUsd.toLocaleString()}`,
    });
    // SAFETY: upsertProduct chỉ đọc field index (slug/name/reference/collection/price) —
    // row Prisma create trả đủ field, cast qua Record để khớp signature Meili.
    await this.meili.upsertProduct(row as unknown as Record<string, unknown>);
    return { slug: row.slug };
  }

  /** Sửa sản phẩm (cho phép đổi giá/labels/ẩn-hiện; không đổi slug). */
  async updateProduct(
    slug: string,
    body: Record<string, unknown>,
    byUserId?: string,
  ) {
    const exists = await this.prisma.product.findUnique({ where: { slug } });
    if (!exists) throw new NotFoundException('Không thấy sản phẩm');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined)
      data.name = String(body.name).slice(0, 200);
    if (body.reference !== undefined)
      data.reference = String(body.reference);
    if (body.collection !== undefined)
      data.collection = String(body.collection).slice(0, 100);
    if (body.priceUsd !== undefined) {
      const priceUsd = Math.max(0, Math.floor(Number(body.priceUsd) || 0));
      if (priceUsd <= 0) throw new BadRequestException('Giá không hợp lệ');
      data.priceUsd = priceUsd;
      data.priceVnd = linePrice(priceUsd, null).priceVnd;
    }
    for (const k of [
      'shortDescription',
      'strapLabel',
      'cardImage',
      'calibre',
      'caseMaterial',
      'narrative',
    ]) {
      if (body[k] !== undefined) data[k] = String(body[k]);
    }
    for (const k of ['badges', 'images', 'complications']) {
      if (body[k] !== undefined && Array.isArray(body[k]))
        data[k] = (body[k] as unknown[]).map((x) => String(x));
    }
    if (body.specs !== undefined) data.specs = body.specs;
    // --- Certified Pre-Owned (chỉ admin được sửa; validate chặt) ---
    if (body.condition !== undefined) {
      const c = String(body.condition ?? '').trim().toUpperCase();
      data.condition = c === 'PRE_OWNED' ? 'PRE_OWNED' : null;
    }
    if (body.certifiedBy !== undefined)
      data.certifiedBy = String(body.certifiedBy).trim().slice(0, 160) || null;
    if (body.certifiedAt !== undefined) {
      const raw = String(body.certifiedAt ?? '').trim();
      if (!raw) data.certifiedAt = null;
      else {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('certifiedAt không phải ngày hợp lệ');
        data.certifiedAt = d;
      }
    }
    if (body.serviceHistory !== undefined) {
      const arr = Array.isArray(body.serviceHistory) ? body.serviceHistory : [];
      data.serviceHistory = arr
        .slice(0, 24)
        .map((h) => ({
          date: String((h as { date?: string })?.date ?? '').slice(0, 24),
          label: String((h as { label?: string })?.label ?? '').slice(0, 120),
          detail: String((h as { detail?: string })?.detail ?? '').slice(0, 300),
        }))
        .filter((h) => h.date && h.label);
    }
    if (body.ratingValue !== undefined) {
      const rv = Number(body.ratingValue);
      data.ratingValue = Number.isFinite(rv) && rv > 0 && rv <= 5 ? rv : null;
    }
    if (body.ratingCount !== undefined) {
      const rc = Math.floor(Number(body.ratingCount) || 0);
      data.ratingCount = rc > 0 ? rc : null;
    }
    if (body.diameterMm !== undefined)
      data.diameterMm = Number(body.diameterMm) || 0;
    if (body.stock !== undefined)
      data.stock = Math.max(0, Math.floor(Number(body.stock) || 0));
    if (body.inBoutique !== undefined)
      data.inBoutique = body.inBoutique !== false;
    const row = await this.prisma.product.update({ where: { slug }, data });
    const changed = Object.keys(data).join(',');
    await auditEvent(this.prisma, {
      slug,
      action: 'UPDATE',
      byUserId,
      summary: changed || 'no-change',
      changes: productDiff(exists, row, Object.keys(data)),
    });
    // Đồng bộ Meili: row đã update đủ field index cần (merge exists+data
    // cho field không đổi vẫn đúng vì update trả row đầy đủ).
    // SAFETY: như trên — row update đầy đủ, Meili chỉ đọc field index.
    await this.meili.upsertProduct(row as unknown as Record<string, unknown>);
    return { slug: row.slug };
  }

  async productEvents(slug: string) {
    return this.prisma.productEvent.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
