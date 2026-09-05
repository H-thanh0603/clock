import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildPayUrl,
  signParams,
  verifyReturn,
  vnpayEnv,
} from "@/lib/vnpay";

const HASH_SECRET = "TEST_HASH_SECRET_ABC123";

describe("signParams", () => {
  it("sắp xếp params theo key và ký HMAC-SHA512", () => {
    const { query, hash } = signParams(
      { vnp_Version: "2.1.0", vnp_Currency: "VND" },
      HASH_SECRET
    );
    // Luôn sắp xếp theo thứ tự key
    expect(query).toBe("vnp_Currency=VND&vnp_Version=2.1.0");
    expect(hash).toMatch(/^[a-f0-9]{128}$/);
  });

  it("encode giá trị chứa ký tự đặc biệt", () => {
    const { query } = signParams(
      { vnp_OrderInfo: "Thanh toan don AC-2026 abcd+xyz" },
      HASH_SECRET
    );
    expect(query).toContain("Thanh+toan+don+AC-2026+abcd%2Bxyz");
  });

  it("deterministic cho cùng input", () => {
    const a = signParams({ k: "v" }, HASH_SECRET);
    const b = signParams({ k: "v" }, HASH_SECRET);
    expect(a).toEqual(b);
  });
});

describe("verifyReturn", () => {
  const prevSecret = process.env.VNPAY_HASH_SECRET;

  beforeAll(() => {
    process.env.VNPAY_HASH_SECRET = HASH_SECRET;
  });

  afterAll(() => {
    process.env.VNPAY_HASH_SECRET = prevSecret;
  });

  it("chấp nhận checksum hợp lệ (đã loại vnp_SecureHash)", () => {
    const params: Record<string, string> = {
      vnp_ResponseCode: "00",
      vnp_TxnRef: "AC-1",
      vnp_Amount: "10000",
    };
    const { hash } = signParams(params, HASH_SECRET);
    expect(
      verifyReturn({ ...params, vnp_SecureHash: hash, vnp_SecureHashType: "SHA512" })
    ).toBe(true);
  });

  it("từ chối checksum sai", () => {
    const params = { vnp_ResponseCode: "00", vnp_TxnRef: "AC-1" };
    expect(verifyReturn({ ...params, vnp_SecureHash: "0".repeat(128) })).toBe(
      false
    );
  });

  it("từ chối khi thiếu vnp_SecureHash", () => {
    expect(verifyReturn({ vnp_ResponseCode: "00" })).toBe(false);
  });
});

describe("vnpayEnv", () => {
  it("trả về URL sandbox mặc định khi không config", () => {
    const env = vnpayEnv();
    expect(env.url).toContain("sandbox.vnpayment.vn");
  });
});

describe("buildPayUrl", () => {
  const prevTmn = process.env.VNPAY_TMN_CODE;
  const prevSecret = process.env.VNPAY_HASH_SECRET;

  afterEach(() => {
    process.env.VNPAY_TMN_CODE = prevTmn;
    process.env.VNPAY_HASH_SECRET = prevSecret;
  });

  it("dựng đúng amount = vnd × 100 và đủ params bắt buộc", () => {
    process.env.VNPAY_TMN_CODE = "TMN01";
    process.env.VNPAY_HASH_SECRET = HASH_SECRET;
    const url = buildPayUrl({
      txnRef: "REF-1",
      amountVnd: 3650000000,
      orderInfo: "Thanh toan don AC-2026",
      returnUrl: "http://localhost:3000/api/payments/vnpay/return",
      ipAddr: "127.0.0.1",
    });
    expect(url.startsWith("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?")).toBe(true);
    expect(url).toContain("vnp_Amount=365000000000");
    expect(url).toContain("vnp_TmnCode=TMN01");
    expect(url).toContain("vnp_TxnRef=REF-1");
    expect(url).toContain("vnp_SecureHash=");
  });

  it("throw khi thiếu config TMN code/hash secret", () => {
    process.env.VNPAY_TMN_CODE = "";
    process.env.VNPAY_HASH_SECRET = "";
    expect(() =>
      buildPayUrl({
        txnRef: "REF",
        amountVnd: 1000,
        orderInfo: "x",
        returnUrl: "http://localhost",
        ipAddr: "127.0.0.1",
      })
    ).toThrow(/VNPAY_TMN_CODE/);
  });
});