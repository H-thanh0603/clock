import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeiliService } from '../search/meili.service';
import { searchHint, type SearchHint } from '../common/jev';

/** Shape sản phẩm trả client (priceVnd number — BigInt không serialize JSON được). */
export type ProductDto = {
  slug: string;
  name: string;
  reference: string;
  collection: string;
  priceUsd: number;
  priceVnd: number;
  shortDescription: string;
  badges: string[];
  strapLabel: string;
  cardImage: string;
  images: string[];
  calibre: string;
  diameterMm: number;
  caseMaterial: string;
  complications: string[];
  inBoutique: boolean;
  stock: number;
  specs: { label: string; value: string }[];
  narrative: string;
};

function toDto(row: {
  slug: string;
  name: string;
  reference: string;
  collection: string;
  priceUsd: number;
  priceVnd: bigint;
  shortDescription: string;
  badges: string[];
  strapLabel: string;
  cardImage: string;
  images: string[];
  calibre: string;
  diameterMm: number;
  caseMaterial: string;
  complications: string[];
  inBoutique: boolean;
  stock: number;
  /** List projection không select 2 field này → nullish fallback. */
  specs?: unknown;
  narrative?: string;
}): ProductDto {
  return {
    slug: row.slug,
    name: row.name,
    reference: row.reference,
    collection: row.collection,
    priceUsd: row.priceUsd,
    priceVnd: Number(row.priceVnd),
    shortDescription: row.shortDescription,
    badges: row.badges,
    strapLabel: row.strapLabel,
    cardImage: row.cardImage,
    images: row.images,
    calibre: row.calibre,
    diameterMm: row.diameterMm,
    caseMaterial: row.caseMaterial,
    complications: row.complications,
    inBoutique: row.inBoutique,
    stock: row.stock,
    specs: (row.specs as { label: string; value: string }[] | undefined) ?? [],
    narrative: row.narrative ?? '',
  };
}

export type ProductQuery = {
  q?: string;
  collection?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'newest';
  page?: number;
  limit?: number;
  /** Filter server-side cho catalog (FE gửi kèm trong query params). */
  movements?: string[];
  material?: string;
  size?: string;
  complications?: string[];
};

/**
 * Predicate bộ máy → điều kiện Prisma (di chuyển từ FE, audit FE-001:
 * filter client-side từng sai vì chỉ thấy 1 page).
 * key: tourbillon | automatic | manual | chrono.
 */
function movementWhere(ids: string[]): Record<string, unknown>[] {
  const or: Record<string, unknown>[] = [];
  for (const id of ids) {
    if (id === 'tourbillon')
      or.push(
        { collection: 'tourbillon' },
        { complications: { hasSome: ['Tourbillon'] } },
      );
    else if (id === 'automatic')
      or.push({ collection: { in: ['classic', 'grand-complication'] } });
    else if (id === 'manual') or.push({ collection: 'skeleton' });
    else if (id === 'chrono')
      or.push(
        { collection: 'sport' },
        { complications: { hasSome: ['Chronograph', 'Chronograph Flyback', 'Date'] } },
      );
  }
  return or;
}

const MATERIAL_WHERE: Record<string, Record<string, unknown>> = {
  rose: { caseMaterial: { contains: 'rose', mode: 'insensitive' } },
  platinum: { caseMaterial: { contains: 'platinum', mode: 'insensitive' } },
  titanium: { caseMaterial: { contains: 'titanium', mode: 'insensitive' } },
  ceramic: {
    OR: [
      { caseMaterial: { contains: 'carbon', mode: 'insensitive' } },
      { caseMaterial: { contains: 'ceramic', mode: 'insensitive' } },
    ],
  },
};

const SIZE_WHERE: Record<string, Record<string, unknown>> = {
  '39': { diameterMm: { lte: 39.5 } },
  '40': { AND: [{ diameterMm: { gt: 39.5 } }, { diameterMm: { lte: 40.5 } }] },
  '41': { AND: [{ diameterMm: { gt: 40.5 } }, { diameterMm: { lt: 42.5 } }] },
  '42.5': { diameterMm: { gte: 42.5 } },
};

/** Complication filter: match "contains" để bắt cả biến thể (Flyback...). */
const COMPLICATION_WHERE: Record<string, Record<string, unknown>> = {
  perpetual: { complications: { hasSome: ['Perpetual Calendar'] } },
  moonphase: { complications: { hasSome: ['Moonphase'] } },
  repeater: { complications: { hasSome: ['Minute repeater'] } },
  skeleton: { complications: { hasSome: ['Skeleton'] } },
};

const MAX_LIMIT = 50;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meili: MeiliService,
  ) {}

  async list(
    query: ProductQuery,
    opts: { includeHidden?: boolean } = {},
  ): Promise<{
    items: ProductDto[];
    total: number;
    page: number;
    limit: number;
    /** Gợi ý 1 filter khi query rỗng (FE render nút "Ý bạn là ...?"). */
    hint?: SearchHint;
  }> {
    const q = (query.q ?? '').trim();
    const collection = (query.collection ?? '').trim();
    const sort = query.sort ?? 'featured';
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(Number(query.limit) || 12)),
    );
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const and: Record<string, unknown>[] = [];
    const hasFilters = Boolean(
      query.movements?.length ||
        (query.material && MATERIAL_WHERE[query.material]) ||
        (query.size && SIZE_WHERE[query.size]) ||
        query.complications?.length,
    );
    // Catalog public chỉ hiện SP đang trưng bày — admin tắt inBoutique
    // nghĩa là "ẩn khỏi cửa hàng" (audit P3: trước đây vẫn hiện).
    // Backoffice gọi kèm includeHidden để vẫn thấy + sửa được SP ẩn.
    if (!opts.includeHidden) and.push({ inBoutique: true });
    if (collection) and.push({ collection });
    if (query.movements?.length) {
      const or = movementWhere(query.movements);
      if (or.length) and.push({ OR: or });
    }
    if (query.material && MATERIAL_WHERE[query.material])
      and.push(MATERIAL_WHERE[query.material]);
    if (query.size && SIZE_WHERE[query.size]) and.push(SIZE_WHERE[query.size]);
    if (query.complications?.length) {
      const ors = query.complications
        .map((c) => COMPLICATION_WHERE[c])
        .filter(Boolean);
      if (ors.length) and.push({ OR: ors });
    }
    if (q) {
      // Full-text qua Meilisearch (typo-tolerance: "tourbillan" vẫn ra).
      // Meili chỉ trả slug theo relevance — Prisma vẫn là nguồn dữ liệu +
      // nơi áp filter/sort/pagination. Meili chết → Prisma contains cũ.
      let slugs: string[] | null = null;
      if (this.meili.enabled) {
        try {
          // includeHidden: backoffice tìm được cả SP ẩn để sửa — catalog
          // public thì Meili lọc inBoutique=true sẵn.
          slugs = await this.meili.searchSlugs(q, 200, Boolean(opts.includeHidden));
        } catch {
          slugs = null; // fallback bên dưới
        }
      }
      if (slugs !== null) {
        if (!slugs.length) {
          // Meili nói không có kết quả — tin luôn (khỏi quét DB), nhưng hỏi
          // Jev 1 call xem khách đang tìm filter nào để FE gợi ý thay vì
          // trang trắng. Jev tắt/chết → hint undefined, FE như cũ.
          const hint = q.length >= 2 ? await searchHint(q) : null;
          return {
            items: [],
            total: 0,
            page,
            limit,
            ...(hint ? { hint } : {}),
          };
        }
        and.push({ slug: { in: slugs } });
        // Sort theo relevance của Meili: lấy slug theo thứ tự rồi map lại
        if (sort === 'featured' && !collection && !hasFilters) {
          return this.listBySlugs(slugs, page, limit, opts);
        }
      } else {
        and.push({
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { reference: { contains: q, mode: 'insensitive' } },
          ],
        });
      }
    }
    // Prisma AND-thêm chuỗi điều kiện; where rỗng = lấy tất cả.
    const where: Record<string, unknown> = and.length ? { AND: and } : {};
    const orderBy =
      sort === 'price-asc'
        ? { priceUsd: 'asc' as const }
        : sort === 'price-desc'
          ? { priceUsd: 'desc' as const }
          : sort === 'newest'
            ? { createdAt: 'desc' as const }
            : { priceUsd: 'desc' as const };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        // List chỉ cần field card/grid — bỏ specs JSON + narrative Text
        // nặng khỏi payload catalog (audit API-003). Detail lấy full ở bySlug.
        select: {
          slug: true,
          name: true,
          reference: true,
          collection: true,
          priceUsd: true,
          priceVnd: true,
          shortDescription: true,
          badges: true,
          strapLabel: true,
          cardImage: true,
          images: true,
          calibre: true,
          diameterMm: true,
          caseMaterial: true,
          complications: true,
          inBoutique: true,
          stock: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    // Nhánh Prisma (không Meili) cũng rỗng → gợi ý như nhánh Meili rỗng.
    if (total === 0 && q && q.length >= 2) {
      const hint = await searchHint(q);
      if (hint) return { items: [], total: 0, page, limit, hint };
    }
    return { items: rows.map(toDto), total, page, limit };
  }
  private async listBySlugs(
    slugs: string[],
    page: number,
    limit: number,
    opts: { includeHidden?: boolean },
  ) {
    const pageSlugs = slugs.slice((page - 1) * limit, page * limit);
    if (!pageSlugs.length) return { items: [], total: slugs.length, page, limit };
    const rows = await this.prisma.product.findMany({
      where: {
        slug: { in: pageSlugs },
        ...(opts.includeHidden ? {} : { inBoutique: true }),
      },
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const items = pageSlugs
      .map((s) => bySlug.get(s))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map(toDto);
    return { items, total: slugs.length, page, limit };
  }

  async bySlug(slug: string): Promise<ProductDto> {
    const row = await this.prisma.product.findUnique({ where: { slug } });
    // SP ẩn (inBoutique=false) không xem được trang detail public —
    // consistent với list; admin quản lý qua ProductManager (API admin riêng).
    if (!row || !row.inBoutique) throw new NotFoundException('Không thấy sản phẩm');
    return toDto(row);
  }
}
