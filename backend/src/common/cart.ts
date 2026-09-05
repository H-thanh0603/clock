import { linePrice } from './pricing';

/** Shape giỏ trả về client (khớp ClientCartItem của frontend CartProvider). */
export type ClientCartItem = {
  slug: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap: string;
  engraving?: string;
  qty: number;
};

export type CartRow = {
  productSlug: string;
  name: string;
  priceUsd: number;
  priceVnd: bigint;
  image: string;
  strap: string;
  engraving: string | null;
  qty: number;
};

export function toClientItem(r: CartRow): ClientCartItem {
  return {
    slug: r.productSlug,
    name: r.name,
    priceUsd: r.priceUsd,
    priceVnd: Number(r.priceVnd),
    image: r.image,
    strap: r.strap,
    engraving: r.engraving ?? undefined,
    qty: r.qty,
  };
}

/**
 * Seam lưu trữ giỏ — triển khai bởi Prisma (server) hoặc fake trong test.
 * Row shape tuân theo CartRow (priceVnd bigint).
 */
export interface CartStorage {
  list(userId: string): Promise<CartRow[]>;
  upsert(
    userId: string,
    key: { productSlug: string; strap: string },
    data: {
      create: Omit<CartRow, 'productSlug' | 'strap'> & {
        productSlug: string;
        strap: string;
      };
      incrementQty: number;
    },
  ): Promise<void>;
  /** Gộp nhiều dòng trong 1 transaction (nếu storage hỗ trợ). */
  upsertMany?(
    userId: string,
    lines: {
      key: { productSlug: string; strap: string };
      data: {
        create: Omit<CartRow, 'productSlug' | 'strap'> & {
          productSlug: string;
          strap: string;
        };
        incrementQty: number;
      };
    }[],
  ): Promise<void>;
  updateQty(
    userId: string,
    key: { productSlug: string; strap: string },
    qty: number,
  ): Promise<void>;
  remove(
    userId: string,
    key: { productSlug: string; strap: string },
  ): Promise<void>;
  clear(userId: string): Promise<void>;
}

export type CartOutcome =
  | { ok: true; items: ClientCartItem[] }
  | { ok: false; status: 400 | 401; error: string };

const DEFAULT_STRAP = 'Tiêu chuẩn Atelier';

function clampQty(qty: unknown): number {
  return Math.min(99, Math.max(1, Math.floor(Number(qty ?? 1)) || 1));
}

async function listItems(
  storage: CartStorage,
  userId: string,
): Promise<ClientCartItem[]> {
  const rows = await storage.list(userId);
  return rows.map(toClientItem);
}

/** Chuẩn hoá 1 dòng raw (client/merge) → dữ liệu upsert đã chốt giá server-side. */
function normalizeLine(it: {
  slug?: string;
  name?: string;
  priceUsd?: number;
  image?: string;
  strap?: string;
  engraving?: string;
  qty?: number;
}):
  | {
      ok: true;
      row: Extract<CartRow, { productSlug: string }>;
    }
  | { ok: false } {
  const productSlug = String(it.slug ?? '').trim();
  const name = String(it.name ?? '').trim();
  if (!productSlug || !name) return { ok: false };
  const strap = String(it.strap ?? DEFAULT_STRAP) || DEFAULT_STRAP;
  // Giá chốt server-side (C1): USD gốc client + delta strap, VND suy ra.
  const { priceUsd, priceVnd } = linePrice(
    Math.max(0, Math.floor(Number(it.priceUsd) || 0)),
    strap,
  );
  return {
    ok: true,
    row: {
      productSlug,
      name: name.slice(0, 200),
      priceUsd,
      priceVnd: BigInt(priceVnd),
      image: String(it.image ?? ''),
      strap,
      engraving: it.engraving ? String(it.engraving).slice(0, 120) : null,
      qty: clampQty(it.qty),
    },
  };
}

export async function getCart(
  storage: CartStorage,
  userId: string,
): Promise<ClientCartItem[]> {
  return listItems(storage, userId);
}

export async function addToCart(
  storage: CartStorage,
  userId: string,
  raw: {
    slug?: string;
    name?: string;
    priceUsd?: number;
    image?: string;
    strap?: string;
    engraving?: string;
    qty?: number;
  },
): Promise<CartOutcome> {
  const line = normalizeLine(raw);
  if (!line.ok)
    return { ok: false, status: 400, error: 'Thiếu thông tin vật phẩm' };
  await storage.upsert(
    userId,
    {
      productSlug: line.row.productSlug,
      strap: line.row.strap,
    },
    {
      create: line.row,
      incrementQty: line.row.qty,
    },
  );
  return { ok: true, items: await listItems(storage, userId) };
}

export async function updateCartQty(
  storage: CartStorage,
  userId: string,
  key: { slug?: string; strap?: string; qty?: number },
): Promise<CartOutcome> {
  const productSlug = String(key.slug ?? '');
  const strap = String(key.strap ?? '');
  const qty = clampQty(key.qty);
  if (!productSlug || !Number.isFinite(qty))
    return { ok: false, status: 400, error: 'Thiếu slug/số lượng' };
  await storage.updateQty(userId, { productSlug, strap }, qty);
  return { ok: true, items: await listItems(storage, userId) };
}

export async function removeFromCart(
  storage: CartStorage,
  userId: string,
  key: { slug?: string; strap?: string },
): Promise<CartOutcome> {
  const productSlug = String(key.slug ?? '');
  if (!productSlug)
    return { ok: false, status: 400, error: 'Thiếu slug' };
  await storage.remove(userId, {
    productSlug,
    strap: String(key.strap ?? ''),
  });
  return { ok: true, items: await listItems(storage, userId) };
}

export async function clearCart(
  storage: CartStorage,
  userId: string,
): Promise<CartOutcome> {
  await storage.clear(userId);
  return { ok: true, items: await listItems(storage, userId) };
}

/** Gộp giỏ khách (local) lên DB khi đăng nhập: dòng hợp lệ → tăng qty, dòng hỏng → bỏ qua. */
export async function mergeGuestCart(
  storage: CartStorage,
  userId: string,
  rawItems: unknown,
): Promise<CartOutcome> {
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 50) : [];
  const batch: Parameters<NonNullable<CartStorage['upsertMany']>>[1] = [];
  for (const raw of items) {
    const line = normalizeLine(
      (raw ?? {}) as Parameters<typeof normalizeLine>[0],
    );
    if (!line.ok) continue;
    batch.push({
      key: { productSlug: line.row.productSlug, strap: line.row.strap },
      data: { create: line.row, incrementQty: line.row.qty },
    });
  }
  // 1 roundtrip duy nhất nếu storage hỗ trợ batch, ngược lại vẫn đúng.
  if (batch.length > 0) {
    if (storage.upsertMany) await storage.upsertMany(userId, batch);
    else for (const l of batch) await storage.upsert(userId, l.key, l.data);
  }
  return { ok: true, items: await listItems(storage, userId) };
}
