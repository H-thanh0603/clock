import { describe, expect, it } from 'vitest';
import { WishlistService } from './wishlist.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Wishlist — merge slug local vào DB (dedupe + cap 200), remove theo slug.
 * Stub Prisma giữ state để assert kết quả trả về sau mỗi lần ghi.
 */
function makeSvc(seed: string[] = []) {
  const rows = new Map<string, { userId: string; productSlug: string; createdAt: number }>();
  let seq = 0;
  for (const s of seed) rows.set(`${'u'}:${s}`, { userId: 'u', productSlug: s, createdAt: seq++ });

  const prisma = {
    wishlistItem: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          [...rows.values()]
            .filter((r) => r.userId === where.userId)
            .sort((a, b) => b.createdAt - a.createdAt),
        ),
      createMany: ({ data }: { data: { userId: string; productSlug: string }[] }) => {
        for (const d of data) {
          const k = `${d.userId}:${d.productSlug}`;
          if (!rows.has(k)) rows.set(k, { ...d, createdAt: seq++ });
        }
        return Promise.resolve({ count: data.length });
      },
      deleteMany: ({ where }: { where: { userId: string; productSlug: string } }) => {
        const k = `${where.userId}:${where.productSlug}`;
        const had = rows.delete(k);
        return Promise.resolve({ count: had ? 1 : 0 });
      },
    },
  } as unknown as PrismaService;
  return new WishlistService(prisma);
}

describe('WishlistService', () => {
  it('merge dedupe + trim + bỏ rỗng, trả list mới nhất trước', async () => {
    const svc = makeSvc();
    const r = await svc.merge('u', [' a ', 'b', 'a', '', null, '  ']);
    expect(r.sort()).toEqual(['a', 'b']);
  });

  it('merge không phải array → no-op, vẫn trả list hiện có', async () => {
    const svc = makeSvc(['x']);
    expect(await svc.merge('u', 'not-array')).toEqual(['x']);
    expect(await svc.merge('u', undefined)).toEqual(['x']);
  });

  it('merge cap 200 slug', async () => {
    const svc = makeSvc();
    const many = Array.from({ length: 250 }, (_, i) => `s${i}`);
    const r = await svc.merge('u', many);
    expect(r).toHaveLength(200);
  });

  it('remove chỉ xóa đúng slug, giữ phần còn lại', async () => {
    const svc = makeSvc(['a', 'b', 'c']);
    const r = await svc.remove('u', 'b');
    expect(r.sort()).toEqual(['a', 'c']);
    // xóa slug không tồn tại → không đổi
    expect((await svc.remove('u', 'zzz')).sort()).toEqual(['a', 'c']);
  });
});
