/**
 * Idempotency-Key cho POST /orders (P1-5): FE sinh 1 key/lần bấm "đặt hàng",
 * gửi kèm header. Retry mạng/double-click cùng key → BE trả đơn cũ thay vì
 * tạo đơn mới + trừ kho lần nữa.
 *
 * Key gắn với fingerprint giỏ: đổi món/số lượng → key mới. Nếu không, ca
 * "response mất + user sửa giỏ + bấm lại" sẽ replay về đơn cũ không còn
 * đúng giỏ hiện tại.
 */

export type KeyStorage = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

const PREFIX = "aurel-checkout-key:";

function memStore(): KeyStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

const fallback = memStore();

function defaultStore(): KeyStorage {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // SSR / test node — dùng memory fallback.
  }
  return fallback;
}

export type CartLine = { slug: string; qty: number; priceUsd: number };

/** Fingerprint ngắn của giỏ — đổi giỏ là đổi fingerprint. */
export function checkoutFingerprint(items: CartLine[]): string {
  const parts = items
    .map((i) => `${i.slug}:${i.qty}:${i.priceUsd}`)
    .sort()
    .join("|");
  let h = 0;
  for (let i = 0; i < parts.length; i++) {
    h = (Math.imul(h, 31) + parts.charCodeAt(i)) | 0;
  }
  return `fp${(h >>> 0).toString(36)}`;
}

function freshKey(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid.replace(/[^A-Za-z0-9_-]/g, "");
  } catch {
    // bỏ qua — dùng fallback bên dưới.
  }
  return `ck${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Key cho fingerprint hiện tại (tạo mới + lưu nếu chưa có). */
export function getCheckoutKey(
  fingerprint: string,
  store: KeyStorage = defaultStore(),
): string {
  const k = `${PREFIX}${fingerprint}`;
  const existing = store.getItem(k);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const key = freshKey().slice(0, 64);
  store.setItem(k, key);
  return key;
}

/** Xóa key khi đã nhận response tạo đơn (key đã "tiêu thụ"). */
export function clearCheckoutKey(
  fingerprint: string,
  store: KeyStorage = defaultStore(),
): void {
  try {
    store.removeItem(`${PREFIX}${fingerprint}`);
  } catch {
    // storage đầy/khóa — key cũ cùng lắm replay 1 lần, không chặn checkout.
  }
}
