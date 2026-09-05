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
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  payments?: PaymentDto[];
};

/** Chi tiết đơn theo mã (public — mã đơn đủ khó đoán). null = không thấy. */
export async function getOrderByCode(code: string): Promise<OrderDto | null> {
  try {
    return await apiJson<OrderDto>(
      `/orders/by-code/${encodeURIComponent(code)}`
    );
  } catch {
    return null;
  }
}

/** Đơn của user đang đăng nhập. null = chưa đăng nhập. */
export async function getMyOrders(): Promise<OrderDto[] | null> {
  try {
    return await apiJson<OrderDto[]>("/orders/mine", {
      forwardCookies: true,
    });
  } catch {
    return null;
  }
}

/** Danh sách đơn cho trang admin (kèm counts theo status). */
export async function getAdminOrders(status?: string): Promise<{
  orders: OrderDto[];
  counts: { status: string; _count: { status: number } }[];
} | null> {
  try {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return await apiJson(`/admin/orders${q}`, { forwardCookies: true });
  } catch {
    return null;
  }
}
