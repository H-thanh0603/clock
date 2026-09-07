import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPayUrl,
  settlePayment,
  signParams,
  verifyReturn,
  vnpayEnv,
  type SettleDeps,
} from "./vnpay";

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
  // process.env.X = undefined lưu thành chuỗi "undefined" (truthy) —
  // phải delete key khi giá trị gốc chưa tồn tại.
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  const prevEnv = process.env.VNPAY_ENV;
  const prevUrl = process.env.VNPAY_URL;
  const prevTmnEnv = process.env.VNPAY_TMN_CODE;

  afterEach(() => {
    restore("VNPAY_ENV", prevEnv);
    restore("VNPAY_URL", prevUrl);
    restore("VNPAY_TMN_CODE", prevTmnEnv);
  });

  it("trả về URL sandbox mặc định khi không config", () => {
    const env = vnpayEnv();
    expect(env.url).toContain("sandbox.vnpayment.vn");
  });

  it("VNPAY_ENV=production → fallback cổng thật, bỏ qua VNPAY_URL sandbox", () => {
    process.env.VNPAY_ENV = "production";
    delete process.env.VNPAY_URL;
    process.env.VNPAY_TMN_CODE = "AUREL01";
    const env = vnpayEnv();
    expect(env.url).toContain("vnpayment.vn/paymentv2");
    expect(env.url).not.toContain("sandbox");
  });

  it("VNPAY_ENV=production thiếu TMN code → throw, không lén chạy sandbox", () => {
    process.env.VNPAY_ENV = "production";
    delete process.env.VNPAY_TMN_CODE;
    expect(() => vnpayEnv()).toThrow("VNPAY_TMN_CODE");
  });

  it("VNPAY_ENV rỗng → fallback sandbox, không dính state production", () => {
    process.env.VNPAY_ENV = "";
    process.env.VNPAY_TMN_CODE = "TMN01";
    delete process.env.VNPAY_URL;
    const env = vnpayEnv();
    expect(env.url).toContain("sandbox.vnpayment.vn");
  });
});

describe("buildPayUrl", () => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  const prevTmn = process.env.VNPAY_TMN_CODE;
  const prevSecret = process.env.VNPAY_HASH_SECRET;
  const prevEnv = process.env.VNPAY_ENV;
  const prevUrl = process.env.VNPAY_URL;

  afterEach(() => {
    restore("VNPAY_TMN_CODE", prevTmn);
    restore("VNPAY_HASH_SECRET", prevSecret);
    restore("VNPAY_ENV", prevEnv);
    restore("VNPAY_URL", prevUrl);
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

describe("settlePayment", () => {
  const prevSecret = process.env.VNPAY_HASH_SECRET;

  function signedParams(over: Record<string, string>) {
    const { hash } = signParams(over, HASH_SECRET);
    return { ...over, vnp_SecureHash: hash };
  }

  function makeDeps(over: Partial<SettleDeps> = {}) {
    const calls = { updatedPayment: [] as string[][], updatedOrder: [] as string[][], clearedCart: [] as (string | null)[] };
    const deps: SettleDeps & { calls: typeof calls } = {
      findPayment: () => Promise.resolve({ id: "pay-1", orderId: "ord-1", status: "PENDING" }),
      getOrder: () => Promise.resolve({ code: "AC-2026-1", totalVnd: 100000, userId: "user-1" }),
      updatePayment: (id, status) => {
        calls.updatedPayment.push([id, status]);
        return Promise.resolve(true);
      },
      updateOrder: (orderId, status) => {
        calls.updatedOrder.push([orderId, status]);
        return Promise.resolve();
      },
      clearCart: (userId) => {
        calls.clearedCart.push(userId);
        return Promise.resolve();
      },
      ...over,
      calls,
    };
    return deps;
  }

  beforeAll(() => {
    process.env.VNPAY_HASH_SECRET = HASH_SECRET;
  });

  afterAll(() => {
    process.env.VNPAY_HASH_SECRET = prevSecret;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guards: checksum sai → không đụng DB", async () => {
    const deps = makeDeps();
    const result = await settlePayment({ vnp_TxnRef: "T1" }, deps);
    expect(result).toEqual({ outcome: "checksum-fail" });
    expect(deps.calls.updatedPayment).toEqual([]);
    expect(deps.calls.updatedOrder).toEqual([]);
  });

  it("guards: payment không tồn tại", async () => {
    const deps = makeDeps({ findPayment: () => Promise.resolve(null) });
    const r = await settlePayment(signedParams({ vnp_TxnRef: "none" }), deps);
    expect(r.outcome).toBe("payment-not-found");
  });

  it("guards: amount lệch → amount-mismatch, không PAID", async () => {
    const deps = makeDeps();
    const r = await settlePayment(
      signedParams({ vnp_TxnRef: "T1", vnp_Amount: "999999" }),
      deps
    );
    expect(r.outcome).toBe("amount-mismatch");
    expect(deps.calls.updatedPayment).toEqual([]);
  });

  it("success: payment → SUCCESS, order → PAID, clear giỏ", async () => {
    const deps = makeDeps();
    const r = await settlePayment(
      signedParams({ vnp_TxnRef: "T1", vnp_ResponseCode: "00", vnp_Amount: "10000000" }),
      deps
    );
    expect(r).toEqual({ outcome: "success", code: "AC-2026-1" });
    expect(deps.calls.updatedPayment).toEqual([["pay-1", "SUCCESS"]]);
    expect(deps.calls.updatedOrder).toEqual([["ord-1", "PAID"]]);
    expect(deps.calls.clearedCart).toEqual(["user-1"]);
  });

  it("unpaid: response code ≠ 00 → payment FAILED, order không đổi", async () => {
    const deps = makeDeps();
    const r = await settlePayment(
      signedParams({ vnp_TxnRef: "T1", vnp_ResponseCode: "24", vnp_Amount: "10000000" }),
      deps
    );
    expect(r.outcome).toBe("unpaid");
    expect(deps.calls.updatedPayment).toEqual([["pay-1", "FAILED"]]);
    expect(deps.calls.updatedOrder).toEqual([]);
  });

  it("idempotent: payment đã SUCCESS → already-set, không ghi lại", async () => {
    const deps = makeDeps({
      findPayment: () => Promise.resolve({ id: "pay-1", orderId: "ord-1", status: "SUCCESS" }),
    });
    const r = await settlePayment(
      signedParams({ vnp_TxnRef: "T1", vnp_ResponseCode: "00", vnp_Amount: "10000000" }),
      deps
    );
    expect(r).toEqual({ outcome: "already-set", code: "AC-2026-1", settled: true });
    expect(deps.calls.updatedPayment).toEqual([]);
  });

  it("idempotent: payment đã FAILED → already-set settled=false", async () => {
    const deps = makeDeps({
      findPayment: () => Promise.resolve({ id: "pay-1", orderId: "ord-1", status: "FAILED" }),
    });
    const r = await settlePayment(
      signedParams({ vnp_TxnRef: "T1", vnp_ResponseCode: "00", vnp_Amount: "10000000" }),
      deps
    );
    expect(r).toEqual({ outcome: "already-set", code: "AC-2026-1", settled: false });
  });

  it("race: thua conditional update (IPN/return song song) → already-set", async () => {
    const deps = makeDeps({
      updatePayment: () => Promise.resolve(false),
      findPayment: () =>
        Promise.resolve({ id: "pay-1", orderId: "ord-1", status: "SUCCESS" }),
    });
    const r = await settlePayment(
      signedParams({ vnp_TxnRef: "T1", vnp_ResponseCode: "00", vnp_Amount: "10000000" }),
      deps
    );
    expect(r).toEqual({ outcome: "already-set", code: "AC-2026-1", settled: true });
    expect(deps.calls.updatedOrder).toEqual([]);
  });
});
