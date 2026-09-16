import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcryptjs";
import { products } from "../../src/data/products";
import { isSeedManaged } from "../src/common/seed-guard";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@aurel.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin123!";
  // Production không được phép dùng mật khẩu seed mặc định — nếu quên set
  // ADMIN_PASSWORD thì dừng seed thay vì tạo lỗ hổng ai cũng biết.
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
    throw new Error(
      "Seed từ chối chạy ở production: đặt ADMIN_PASSWORD (và ADMIN_EMAIL) trước khi `npm run seed`."
    );
  }
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Atelier Admin",
      passwordHash: await bcrypt.hash(
        adminPassword,
        Number(process.env.BCRYPT_COST ?? 10),
      ),
      role: "ADMIN",
    },
  });
  console.log(`Admin sẵn sàng: ${adminEmail}`);

  // Service account cho AI merchant agent (tách khỏi admin thật — mọi
  // thao tác agent ghi audit under account riêng, truy vết được).
  // AGENT_ADMIN_EMAIL để trống = dùng chung admin thật (chỉ demo).
  const agentEmail = process.env.AGENT_ADMIN_EMAIL ?? "";
  if (agentEmail) {
    const agentPassword = process.env.AGENT_ADMIN_PASSWORD ?? "";
    if (!agentPassword) {
      throw new Error(
        "AGENT_ADMIN_PASSWORD bắt buộc khi đặt AGENT_ADMIN_EMAIL (service account không được phép mật khẩu mặc định)",
      );
    }
    await prisma.user.upsert({
      where: { email: agentEmail },
      update: {},
      create: {
        email: agentEmail,
        name: "AI Merchant Agent (service)",
        passwordHash: await bcrypt.hash(agentPassword, 12),
        role: "ADMIN",
      },
    });
    console.log(`Service account agent sẵn sàng: ${agentEmail}`);
  }
  let skipped = 0;
  for (const p of products) {
    const data = {
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
    };
    const existing = await prisma.product.findUnique({
      where: { slug: p.slug },
      select: { createdAt: true, updatedAt: true },
    });
    if (!existing) {
      await prisma.product.create({ data });
      continue;
    }
    // SP merchant đã sửa (giá/mô tả...) thì GIỮ NGUYÊN — seed chạy lại
    // không được ghi đè công sức vận hành (audit P1-4).
    if (!isSeedManaged(existing.createdAt, existing.updatedAt)) {
      skipped++;
      console.log(`Giữ nguyên ${p.slug} (đã có người sửa — seed không ghi đè)`);
      continue;
    }
    const { slug: _slug, ...rest } = data;
    await prisma.product.update({ where: { slug: p.slug }, data: rest });
  }
  if (skipped > 0)
    console.log(`Seed bỏ qua ${skipped} sản phẩm đã được chỉnh sửa thủ công`);
  const count = await prisma.product.count();
  console.log(`Seeded ${products.length} products (total in DB: ${count})`);

  // Sync Meilisearch (optional — bỏ qua khi MEILI_HOST trống/Meili chưa lên).
  const meiliHost = (process.env.MEILI_HOST ?? '').replace(/\/$/, '');
  if (meiliHost) {
    try {
      const key = process.env.MEILI_MASTER_KEY ?? '';
      const call = async (method: string, path: string, body?: unknown) => {
        const res = await fetch(`${meiliHost}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${key}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok && !(method === 'POST' && path === '/indexes' && res.status === 409)) {
          throw new Error(`Meili ${method} ${path} → ${res.status}`);
        }
      };
      await call('POST', '/indexes', { uid: 'products', primaryKey: 'slug' });
      const rows = await prisma.product.findMany();
      // BigInt (priceVnd) không JSON-serialize được — Meili chỉ cần priceUsd.
      const docs = rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        reference: r.reference,
        collection: r.collection,
        shortDescription: r.shortDescription,
        calibre: r.calibre,
        caseMaterial: r.caseMaterial,
        complications: r.complications,
        priceUsd: r.priceUsd,
        diameterMm: r.diameterMm,
        stock: r.stock,
        inBoutique: r.inBoutique,
      }));
      await call('POST', '/indexes/products/documents', docs);
      console.log(`Meili sync: ${rows.length} documents`);
    } catch (e) {
      console.warn(`Meili sync bị bỏ qua: ${String(e)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
