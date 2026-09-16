import { apiJson } from "@/lib/api";

export type OrderItemDto = {
  id: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap: string;
  engraving: string | null;
  qty: number;
};

export type PaymentDto = {
  id: string;
  method: string;
  amountUsd: number;
  status: string;
  txnRef: string | null;
  createdAt: string;
};

export type OrderEventDto = {
  id: string;
  from: string | null;
  to: string;
  note: string | null;
  createdAt: string;
};

export type OrderDto = {
  id: string;
  code: string;
  userId: string | null;
  customerName: string;
  contact: string;
  address: string;
  slot: string | null;
  status: string;
  totalUsd: number;
  totalVnd: number;
  paidUsd: number;
  paidVnd: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  payments?: PaymentDto[];
  events?: OrderEventDto[];
};

/** Tra cứu tối thiểu khi chưa chứng minh sở hữu (chỉ code + status). */
export type OrderMinimal = {
  code: string;
  status: string;
};

/**
 * Chi tiết đơn theo mã — BE chỉ trả full (items + totals) cho chính chủ
 * (session/contact/sig), còn lại trả OrderMinimal. opt:
 * - sig: chữ ký trong URL redirect VNPay (giữ nguyên từ query).
 * - contact: SĐT/email lúc đặt (nhập tay ở form reveal).
 * null = không thấy đơn.
 */
export async function getOrderByCode(
  code: string,
  opt: { sig?: string; contact?: string } = {}
): Promise<OrderDto | OrderMinimal | null> {
  try {
    const qs = new URLSearchParams();
    if (opt.sig) qs.set("sig", opt.sig);
    if (opt.contact) qs.set("contact", opt.contact);
    const q = qs.toString();
    return await apiJson<OrderDto | OrderMinimal>(
      `/orders/by-code/${encodeURIComponent(code)}${q ? `?${q}` : ""}`
    );
  } catch {
    return null;
  }
}

/** Type guard: response có chi tiết món + tổng tiền không. */
export function isOrderFull(
  o: OrderDto | OrderMinimal
): o is OrderDto {
  return Array.isArray((o as OrderDto).items);
}

/** Đơn của user đang đăng nhập — phân trang server-side. null = chưa đăng nhập. */
export async function getMyOrders(
  page = 1,
  limit = 10
): Promise<{ items: OrderDto[]; total: number } | null> {
  try {
    return await apiJson<{ items: OrderDto[]; total: number }>(
      `/orders/mine?page=${page}&limit=${limit}`,
      { forwardCookies: true }
    );
  } catch {
    return null;
  }
}

/** Danh sách đơn cho trang admin (kèm counts theo status) — phân trang. */
export async function getAdminOrders(
  status?: string,
  page = 1,
  limit = 20
): Promise<{
  orders: OrderDto[];
  counts: { status: string; _count: { status: number } }[];
  total: number;
  page: number;
  limit: number;
} | null> {
  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) qs.set("status", status);
    return await apiJson(`/admin/orders?${qs}`, { forwardCookies: true });
  } catch {
    return null;
  }
}

export type AdminStats = {
  ordersByStatus: { status: string; count: number }[];
  totalOrders: number;
  revenueUsd: number;
  revenueVnd: number;
  totalUsers: number;
  totalProducts: number;
  recentOrders: OrderDto[];
};

export async function getAdminStats(): Promise<AdminStats | null> {
  try {
    return await apiJson<AdminStats>("/admin/stats", {
      forwardCookies: true,
    });
  } catch {
    return null;
  }
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  orderCount: number;
  totalVnd: number;
};

export async function getAdminUsers(
  page = 1,
  limit = 20
): Promise<{ users: AdminUserRow[]; total: number } | null> {
  try {
    return await apiJson<{ users: AdminUserRow[]; total: number }>(
      `/admin/users?page=${page}&limit=${limit}`,
      { forwardCookies: true }
    );
  } catch {
    return null;
  }
}

export type AdminUserDetail = Omit<AdminUserRow, "orderCount" | "totalVnd"> & {
  orders: OrderDto[];
};

export async function getAdminUserDetail(
  id: string
): Promise<AdminUserDetail | null> {
  try {
    return await apiJson<AdminUserDetail>(
      `/admin/users/${encodeURIComponent(id)}`,
      { forwardCookies: true }
    );
  } catch {
    return null;
  }
}
