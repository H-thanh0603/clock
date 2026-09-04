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
