import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Product as ProductRow,
} from "../../generated/prisma/client";
import type { Product } from "@/data/products";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Prisma BigInt không serialize sang client được nên đổi ra number. */
export function toProduct(row: ProductRow): Product {
  return {
    slug: row.slug,
    name: row.name,
    reference: row.reference,
    collection: row.collection as Product["collection"],
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

export async function getProducts(): Promise<Product[]> {
  const rows = await prisma.product.findMany({ orderBy: { priceUsd: "desc" } });
  return rows.map(toProduct);
}

export async function getProduct(slug: string): Promise<Product | null> {
  const row = await prisma.product.findUnique({ where: { slug } });
  return row ? toProduct(row) : null;
}
