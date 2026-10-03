import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeiliService } from '../search/meili.service';
import { linePrice } from '../common/pricing';
import { copyCheck } from '../common/jev';

/**
 * Cụm Promotion của backoffice (CONTEXT.md: Promotion) — tạo theo khung
 * ngày, chặn chồng lên nhau (cron không biết hồi giá về đâu), đóng =
 * hồi giá snapshot + active=false trong 1 tx.
 */
@Injectable()
export class AdminPromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meili: MeiliService,
  ) {}

  async listPromotions(active?: boolean) {
    return this.prisma.promotion.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createPromotion(
    body: {
      name?: unknown;
      listingSlugs?: unknown;
      discountPct?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    },
    byUserId?: string,
  ) {
    const name = String(body.name ?? '').trim().slice(0, 80);
    const slugs = Array.isArray(body.listingSlugs)
      ? (body.listingSlugs as unknown[]).map((s) => String(s)).filter(Boolean)
      : [];
    const discountPct = Number(body.discountPct);
    const startsAt = new Date(String(body.startsAt ?? ''));
    const endsAt = new Date(String(body.endsAt ?? ''));
    if (!name || slugs.length === 0)
      throw new BadRequestException('Thiếu tên hoặc danh sách sản phẩm');
    if (!Number.isFinite(discountPct) || discountPct === 0 || Math.abs(discountPct) > 90)
      throw new BadRequestException('discountPct phải trong [-90, 90] và khác 0');
    if (Number.isNaN(+startsAt) || Number.isNaN(+endsAt) || startsAt >= endsAt)
      throw new BadRequestException('Khung ngày không hợp lệ (starts < ends)');
    // Chặn promotion chồng lên sản phẩm đang trong promotion active khác —
    // giá KM đè nhau rồi cron hồi giá không biết hồi về đâu (BIZ-HIGH-02).
    const overlapping = await this.prisma.promotion.findMany({
      where: { active: true, endsAt: { gt: new Date() } },
      select: { id: true, name: true, listingSlugs: true },
    });
    const clash = overlapping.find((p) =>
      p.listingSlugs.some((s) => slugs.includes(s)),
    );
    if (clash)
      throw new ConflictException(
        `Sản phẩm đã nằm trong khuyến mãi đang chạy "${clash.name}" — tắt nó trước`,
      );
    // Snapshot giá gốc lúc tạo: cron hết hạn hồi giá từ đây. Chỉ snapshot
    // SP tồn tại (slug lạ bỏ qua — apply thật cũng chỉ chạm SP có trong DB).
    const existing = await this.prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, priceUsd: true },
    });
    const priceSnapshot: Record<string, number> = {};
    for (const r of existing) priceSnapshot[r.slug] = r.priceUsd;
    const row = await this.prisma.promotion.create({
      data: {
        name,
        listingSlugs: slugs,
        discountPct,
        startsAt,
        endsAt,
        active: true,
        priceSnapshot,
        createdById: byUserId ?? null,
      },
    });
    // Jev copy guardrail (chặn mềm): tên KM có claim rủi ro → kèm warning,
    // vẫn tạo (admin quyết). Jev tắt/chết → không warning, như cũ.
    const warn = await copyCheck('promotion', name);
    return warn ? { ...row, jevWarning: warn.warning } : row;
  }

  async setPromotionActive(id: string, active: boolean) {
    try {
      if (!active) {
        // Tắt tay giữa chừng cũng hồi giá như hết hạn tự nhiên — nếu không
        // giá KM ở lại vĩnh viễn (cùng bug BIZ-HIGH-02).
        return await this.closePromotion(id, 'Tắt thủ công');
      }
      return await this.prisma.promotion.update({ where: { id }, data: { active } });
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new NotFoundException('Không thấy promotion');
    }
  }

  /**
   * Đóng promotion: hồi giá các SP đã thực sự bị đổi về giá KM, rồi
   * đánh active=false — trong 1 transaction. Chỉ hồi slug có giá hiện tại
   * KHÁC snapshot (promotion tạo mà chưa từng apply giá, hoặc admin đã sửa
   * tay về đúng giá gốc thì không đụng tới).
   */
  async closePromotion(
    id: string,
    reason: string,
  ): Promise<{ id: string; restored: number }> {
    const promo = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Không thấy promotion');
    if (!promo.active) return { id, restored: 0 };
    const snap = (promo.priceSnapshot ?? {}) as Record<string, number>;
    const restoredSlugs: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const [slug, origUsd] of Object.entries(snap)) {
        if (!Number.isFinite(origUsd)) continue;
        const cur = await tx.product.findUnique({
          where: { slug },
          select: { priceUsd: true },
        });
        if (!cur || cur.priceUsd === Math.floor(origUsd)) continue;
        const { priceVnd } = linePrice(Math.floor(origUsd), null);
        await tx.product.update({
          where: { slug },
          data: { priceUsd: Math.floor(origUsd), priceVnd },
        });
        await tx.productEvent.create({
          data: {
            slug,
            action: 'PROMO_END',
            summary: `${promo.name} — ${reason}, hồi giá $${Math.floor(origUsd).toLocaleString()}`,
          },
        });
        restoredSlugs.push(slug);
      }
      await tx.promotion.update({ where: { id }, data: { active: false } });
    });
    // Đồng bộ Meili cho SP vừa hồi giá (best-effort, never throws).
    for (const slug of restoredSlugs) {
      try {
        const row = await this.prisma.product.findUnique({ where: { slug } });
        if (row) {
          // SAFETY: Meili chỉ đọc field index (slug/name/price...) — row đầy đủ.
          await this.meili.upsertProduct(
            row as unknown as Record<string, unknown>,
          );
        }
      } catch {
        // upsertProduct đã warn nội bộ; không chặn response.
      }
    }
    return { id, restored: restoredSlugs.length };
  }
}
