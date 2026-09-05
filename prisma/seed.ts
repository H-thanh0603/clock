import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcryptjs";
import { products } from "../src/data/products";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@aurel.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin123!";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Atelier Admin",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
    },
  });
  console.log(`Admin sẵn sàng: ${adminEmail}`);
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        reference: p.reference,
        collection: p.collection,
        priceUsd: p.priceUsd,
        priceVnd: p.priceVnd,
        shortDescription: p.shortDescription,
        badges: p.badges,
        strapLabel: p.strapLabel,
        cardImage: p.cardImage,
        images: p.images,
        calibre: p.calibre,
        diameterMm: p.diameterMm,
        caseMaterial: p.caseMaterial,
        complications: p.complications,
        inBoutique: p.inBoutique,
        specs: p.specs,
        narrative: p.narrative,
      },
      create: {
        slug: p.slug,
        name: p.name,
        reference: p.reference,
        collection: p.collection,
        priceUsd: p.priceUsd,
        priceVnd: p.priceVnd,
        shortDescription: p.shortDescription,
        badges: p.badges,
        strapLabel: p.strapLabel,
        cardImage: p.cardImage,
        images: p.images,
        calibre: p.calibre,
        diameterMm: p.diameterMm,
        caseMaterial: p.caseMaterial,
        complications: p.complications,
        inBoutique: p.inBoutique,
        specs: p.specs,
        narrative: p.narrative,
      },
    });
  }
  const count = await prisma.product.count();
  console.log(`Seeded ${products.length} products (total in DB: ${count})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
