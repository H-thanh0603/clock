import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Meilisearch integration — typo-tolerance search cho catalog.
 *
 * REST client thuần (fetch, 0 dependency mới): Meili API là JSON đơn giản
 * (POST /indexes/:uid/search, PUT /indexes/:uid/documents) — SDK chính thức
 * chỉ wrap những call này nhưng đòi moduleResolution bundler.
 *
 * Vai trò trong kiến trúc:
 * - ProductsService.list(q) dùng Meili để tìm slug khi có full-text query
 *   (khách gõ "tourbillan" vẫn ra — Prisma contains không làm được).
 * - Filter/sort/pagination vẫn ở Prisma (single source of truth) — Meili
 *   chỉ trả danh sách slug relevance-ordered, Prisma join lại dữ liệu.
 * - Index sync: bootstrap lúc chạy + cập nhật sau mỗi write admin —
 *   không cron, không drift.
 *
 * MEILI_HOST trống hoặc Meili chết → searchSlugs throw, ProductsService
 * catch và fallback Prisma contains. Search không bao giờ fail vì engine.
 */

export const PRODUCTS_INDEX = 'products';

type SearchHit = { slug?: unknown };

/** 409 index_already_exists — flow bình thường của bootstrap idempotent. */
class IndexExistsError extends Error {}

@Injectable()
export class MeiliService implements OnModuleInit {
  private readonly logger = new Logger(MeiliService.name);
  private readonly host: string;
  private readonly apiKey: string;
  private bootstrapped = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() host?: string,
    @Optional() apiKey?: string,
  ) {
    this.host = (host ?? process.env.MEILI_HOST ?? '').replace(/\/$/, '');
    this.apiKey = apiKey ?? process.env.MEILI_MASTER_KEY ?? '';
  }

  get enabled(): boolean {
    return this.host !== '';
  }

  /** App start → index toàn bộ catalog. Fail thì chỉ log, app vẫn chạy. */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('MEILI_HOST trống — search chạy Prisma contains');
      return;
    }
    // Compose: backend thường lên trước meilisearch → thử vài lần trước khi
    // bỏ cuộc. Vẫn fail thì searchSlugs/upsert sẽ bootstrap lại ở request sau
    // (lazy) — search tạm chạy fallback Prisma, không chết app.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.bootstrap();
        return;
      } catch (err) {
        this.logger.warn(
          `Meili bootstrap lần ${attempt}/3 lỗi (search fallback Prisma): ${String(err)}`,
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.host}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      // fetch reject = không kết nối được (service chưa lên/chết mạng).
      throw new Error(`Meili ${method} ${path}: ${String(err)}`);
    }
    if (!res.ok) {
      const text = await res.text();
      // 409 index_already_exists là flow bình thường của bootstrap idempotent.
      if (res.status === 409 && /index_already_exists/.test(text))
        throw new IndexExistsError();
      throw new Error(`Meili ${method} ${path} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  /** Đợi async task (add documents/settings) xong mới trả về. */
  private async waitTask(taskUid: unknown, what: string): Promise<void> {
    const uid = Number(taskUid);
    if (!Number.isFinite(uid)) return;
    // Tasks nhỏ (9 SP demo, settings) xong trong ~1s; chờ tối đa 10s rồi
    // thôi — task vẫn chạy xong phía Meili, ta chỉ không block thêm.
    for (let i = 0; i < 10; i++) {
      const task = await this.call<{ status?: string }>(
        'GET',
        `/tasks/${uid}`,
      ).catch(() => null);
      if (task && (task.status === 'succeeded' || task.status === 'failed')) {
        if (task.status === 'failed')
          this.logger.warn(`Meili task ${uid} (${what}) failed`);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    this.logger.warn(`Meili task ${uid} (${what}) chưa xong sau 5s — tiếp tục`);
  }

  /** Đẩy toàn bộ catalog vào index + cấu hình searchable. Idempotent. */
  async bootstrap(): Promise<void> {
    if (!this.enabled || this.bootstrapped) return;
    // createIndex đã tồn tại → 409 IndexExistsError, bỏ qua (idempotent).
    const created = await this.call<{ taskUid?: unknown }>('POST', '/indexes', {
      uid: PRODUCTS_INDEX,
      primaryKey: 'slug',
    }).catch((err: unknown) => {
      if (err instanceof IndexExistsError) return null;
      throw err;
    });
    if (created) await this.waitTask(created.taskUid, 'createIndex');
    const settings = await this.call<{ taskUid?: unknown }>(
      'PATCH',
      `/indexes/${PRODUCTS_INDEX}/settings`,
      {
        searchableAttributes: [
          'name',
          'reference',
          'shortDescription',
          'calibre',
          'caseMaterial',
          'complications',
          'collection',
        ],
        filterableAttributes: ['collection', 'inBoutique'],
      },
    );
    const rows = await this.prisma.product.findMany();
    const docs = await this.call<{ taskUid?: unknown }>(
      'POST',
      `/indexes/${PRODUCTS_INDEX}/documents`,
      rows.map((r) => this.toDoc(r as unknown as Record<string, unknown>)),
    );
    // Chờ settings + docs xong rồi mới đánh dấu ready — tránh search ngay
    // sau startup trả rỗng (docs task chưa process) rồi tin "không có kết quả".
    await this.waitTask(settings.taskUid, 'settings');
    await this.waitTask(docs.taskUid, 'documents');
    this.bootstrapped = true;
    this.logger.log(`Meili index '${PRODUCTS_INDEX}': ${rows.length} documents`);
  }

  /** Gọi sau admin write (create/update): upsert document. Never throws. */
  async upsertProduct(row: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;
    try {
      // Bootstrap chưa xong (Meili mới lên sau backend) → index lại từ đầu
      // luôn toàn bộ catalog thay vì 1 doc — an toàn vì idempotent.
      if (!this.bootstrapped) await this.bootstrap();
      await this.call('POST', `/indexes/${PRODUCTS_INDEX}/documents`, [this.toDoc(row)]);
    } catch (err) {
      this.logger.warn(`upsertProduct Meili lỗi (bỏ qua): ${String(err)}`);
    }
  }

  /**
   * Full-text search → danh sách slug theo relevance. includeHidden: admin
   * backoffice thấy cả SP ẩn (để sửa được) — catalog public thì lọc luôn.
   * Throw khi Meili chết — caller catch và fallback Prisma contains.
   */
  async searchSlugs(
    q: string,
    limit: number,
    includeHidden = false,
  ): Promise<string[]> {
    if (!this.bootstrapped) await this.bootstrap();
    const body: Record<string, unknown> = { q, limit };
    if (!includeHidden) body['filter'] = 'inBoutique = true';
    const res = await this.call<{ hits: SearchHit[] }>(
      'POST',
      `/indexes/${PRODUCTS_INDEX}/search`,
      body,
    );
    return res.hits
      .map((h) => (typeof h.slug === 'string' ? h.slug : ''))
      .filter(Boolean);
  }

  private toDoc(r: Record<string, unknown>): Record<string, unknown> {
    return {
      slug: String(r['slug'] ?? ''),
      name: String(r['name'] ?? ''),
      reference: String(r['reference'] ?? ''),
      collection: String(r['collection'] ?? ''),
      shortDescription: String(r['shortDescription'] ?? ''),
      calibre: String(r['calibre'] ?? ''),
      caseMaterial: String(r['caseMaterial'] ?? ''),
      complications: (r['complications'] as string[] | undefined) ?? [],
      priceUsd: Number(r['priceUsd'] ?? 0),
      diameterMm: Number(r['diameterMm'] ?? 0),
      stock: Number(r['stock'] ?? 0),
      inBoutique: Boolean(r['inBoutique'] ?? false),
    };
  }
}
