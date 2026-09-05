import crypto from "crypto";

const VNP_VERSION = "2.1.0";
const VNP_COMMAND = "pay";
const VNP_CURR = "VND";
const VNP_ORDER_TYPE = "other";
const VNP_LOCALE = "vn";

export function vnpayEnv() {
  const tmnCode = process.env.VNPAY_TMN_CODE ?? "";
  const hashSecret = process.env.VNPAY_HASH_SECRET ?? "";
  const url =
    process.env.VNPAY_URL ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
  return { tmnCode, hashSecret, url };
}

function vnpDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function encode(v: string) {
  return encodeURIComponent(v).replace(/%20/g, "+");
}

/** Sắp xếp + ký params theo chuẩn VNPay (HMAC-SHA512). */
export function signParams(
  params: Record<string, string>,
  hashSecret: string
) {
  const sorted = Object.keys(params).sort();
  const query = sorted.map((k) => `${encode(k)}=${encode(params[k])}`).join("&");
  const hash = crypto
    .createHmac("sha512", hashSecret)
    .update(Buffer.from(query, "utf-8"))
    .digest("hex");
  return { query, hash };
}

export type CreateVnpayUrlInput = {
  txnRef: string;
  amountVnd: number;
  orderInfo: string;
  returnUrl: string;
  ipAddr: string;
};

export function buildPayUrl(input: CreateVnpayUrlInput) {
  const { tmnCode, hashSecret, url } = vnpayEnv();
  if (!tmnCode || !hashSecret)
    throw new Error("Thiếu VNPAY_TMN_CODE / VNPAY_HASH_SECRET trong .env");
  const params: Record<string, string> = {
    vnp_Version: VNP_VERSION,
    vnp_Command: VNP_COMMAND,
    vnp_TmnCode: tmnCode,
    vnp_Amount: String(Math.round(input.amountVnd) * 100),
    vnp_CurrCode: VNP_CURR,
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: input.orderInfo,
    vnp_OrderType: VNP_ORDER_TYPE,
    vnp_Locale: VNP_LOCALE,
    vnp_ReturnUrl: input.returnUrl,
    vnp_IpAddr: input.ipAddr,
    vnp_CreateDate: vnpDate(),
  };
  const { query, hash } = signParams(params, hashSecret);
  return `${url}?${query}&vnp_SecureHash=${hash}`;
}

/** Kiểm tra checksum VNPay trả về (return + IPN). */
export function verifyReturn(params: Record<string, string>) {
  const { hashSecret } = vnpayEnv();
  const received = params.vnp_SecureHash ?? "";
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "vnp_SecureHash" || k === "vnp_SecureHashType") continue;
    rest[k] = v;
  }
  const { hash } = signParams(rest, hashSecret);
  return received.toLowerCase() === hash.toLowerCase();
}

/** Các phụ thuộc DB cần để settle — inject để test được. */
export type SettleDeps = {
  findPayment: (
    txnRef: string
  ) => Promise<{
    id: string;
    orderId: string;
    status: string;
    expectedVnd?: number | null;
  } | null>;
  getOrder: (
    orderId: string
  ) => Promise<{ code: string; totalVnd: number; userId: string | null } | null>;
  /**
   * Chuyển payment sang SUCCESS/FAILED — PHẢI là update điều kiện
   * (chỉ khi còn PENDING), trả về false nếu payment đã settle trước đó
   * (trường hợp IPN và return chạy song song).
   */
  updatePayment: (id: string, status: "SUCCESS" | "FAILED") => Promise<boolean>;
  updateOrder: (orderId: string, status: "PAID") => Promise<void>;
  /** Xóa giỏ DB của user sau khi VNPay success (giỏ local do client tự clear). */
  clearCart: (userId: string | null) => Promise<void>;
};

export type SettleOutcome =
  /** Thanh toán OK: payment → SUCCESS, order → PAID. */
  | { outcome: "success"; code: string }
  /** Checksum + amount ok nhưng vnp_ResponseCode khác 00: payment → FAILED. */
  | { outcome: "unpaid"; code: string }
  /** Payment không còn PENDING (IPN/return đã xử lý trước) — idempotent. */
  | { outcome: "already-set"; code: string; settled: boolean }
  | { outcome: "checksum-fail" }
  | { outcome: "payment-not-found" }
  | { outcome: "amount-mismatch" };

/**
 * Xử lý một callback VNPay (return hoặc IPN) theo bộ guard thống nhất:
 * checksum → payment tồn tại → amount khớp → còn PENDING → chuyển trạng thái.
 */
export async function settlePayment(
  params: Record<string, string>,
  deps: SettleDeps
): Promise<SettleOutcome> {
  if (!verifyReturn(params)) return { outcome: "checksum-fail" };

  const txnRef = params.vnp_TxnRef ?? "";
  const payment = await deps.findPayment(txnRef);
  if (!payment) return { outcome: "payment-not-found" };

  const order = await deps.getOrder(payment.orderId);
  if (!order) return { outcome: "payment-not-found" };

  // So với số tiền ĐÓNG BĂNG lúc tạo URL (không đọc lại total hiện tại).
  const expected = payment.expectedVnd ?? order.totalVnd;
  const amountOk =
    Math.round(Number(params.vnp_Amount ?? 0) / 100) === Math.round(expected);
  if (!amountOk) return { outcome: "amount-mismatch" };

  if (payment.status !== "PENDING") {
    return {
      outcome: "already-set",
      code: order.code,
      settled: payment.status === "SUCCESS",
    };
  }

  const success = params.vnp_ResponseCode === "00";
  const updated = await deps.updatePayment(
    payment.id,
    success ? "SUCCESS" : "FAILED"
  );
  if (!updated) {
    // Thua race với IPN/return kia — đọc lại trạng thái cuối để trả về.
    const current = await deps.findPayment(txnRef);
    return {
      outcome: "already-set",
      code: order.code,
      settled: current?.status === "SUCCESS",
    };
  }
  if (success) {
    await deps.updateOrder(payment.orderId, "PAID");
    // Thu tiền xong mới clear giỏ (bỏ thanh toán giữa chừng vẫn giữ giỏ).
    await deps.clearCart(order.userId);
  }

  return success
    ? { outcome: "success", code: order.code }
    : { outcome: "unpaid", code: order.code };
}
