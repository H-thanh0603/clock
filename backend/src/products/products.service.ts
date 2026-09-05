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

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({
      orderBy: { priceUsd: 'desc' },
    });
    return rows.map(toDto);
  }

  async bySlug(slug: string): Promise<ProductDto> {
    const row = await this.prisma.product.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException('Không thấy sản phẩm');
    return toDto(row);
  }
}
