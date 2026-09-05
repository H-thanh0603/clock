import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  specs: unknown;
  narrative: string;
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
    specs: (row.specs as { label: string; value: string }[]) ?? [],
    narrative: row.narrative,
  };
}

export type ProductQuery = {
  q?: string;
  collection?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'newest';
  page?: number;
  limit?: number;
};

const MAX_LIMIT = 50;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQuery): Promise<{
    items: ProductDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const q = (query.q ?? '').trim();
    const collection = (query.collection ?? '').trim();
    const sort = query.sort ?? 'featured';
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(Number(query.limit) || 12)),
    );
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const where: Record<string, unknown> = {};
    if (collection) where.collection = collection;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
      ];
    }
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
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toDto), total, page, limit };
  }

  async bySlug(slug: string): Promise<ProductDto> {
    const row = await this.prisma.product.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException('Không thấy sản phẩm');
    return toDto(row);
  }
}
