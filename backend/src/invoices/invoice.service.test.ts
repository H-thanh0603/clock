import { describe, expect, it, vi } from "vitest";
import { InvoiceService } from "./invoice.service";
import type { PrismaService } from "../prisma/prisma.service";

/** Prisma stub — chỉ cần findUnique + create/update cho các path test. */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "inv-1", ...data })
        ),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

/** Ép kiểu một lần cho call-site — giữ type-check cho prisma.invoice.create. */
function asPrisma(p: ReturnType<typeof makePrisma>): PrismaService {
  return p as unknown as PrismaService;
}

const order = {
  code: "AC-2026-42",
  totalVnd: 3650000000,
  customerName: "Nguyễn Văn A",
  contact: "a@example.com",
};

describe("InvoiceService.ensureForOrder", () => {
  it("tạo invoice PENDING_ISSUE khi chưa có (không cấu hình provider)", async () => {
    const svc = new InvoiceService(asPrisma(makePrisma()));
    const inv = await svc.ensureForOrder(order);
    expect(inv).toMatchObject({
      orderCode: "AC-2026-42",
      status: "PENDING_ISSUE",
      buyerEmail: "a@example.com",
    });
  });

  it("đã có invoice → trả về, không tạo lại (idempotent)", async () => {
    const existing = { id: "inv-0", orderCode: order.code, status: "PENDING_ISSUE" };
    const prisma = makePrisma({
      invoice: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    });
    const svc = new InvoiceService(asPrisma(prisma));
    const inv = await svc.ensureForOrder(order);
    expect(inv).toBe(existing);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("contact không phải email → buyerEmail null", async () => {
    const svc = new InvoiceService(asPrisma(makePrisma()));
    const inv = await svc.ensureForOrder({ ...order, contact: "0901234567" });
    expect(inv.buyerEmail).toBeNull();
  });

  it("số tiền vượt Int32 (đơn flagship 3,65 tỷ) được ghi nguyên vẹn", async () => {
    // Regression audit DATA-CRIT: amountVnd Int làm đơn lớn throw.
    const prisma = makePrisma();
    const svc = new InvoiceService(asPrisma(prisma));
    await svc.ensureForOrder(order);
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountVnd: 3650000000 }),
      }),
    );
  });

  it("issueViaProvider serialize được BigInt từ DB thật (không throw TypeError)", async () => {
    // Prisma trả BigInt cho cột BigInt — JSON.stringify(BigInt) throw nếu
    // không đổi sang Number trước.
    const sent: string[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, init: never) => {
      sent.push(String((init as { body?: unknown }).body));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ invoiceNo: "AUR-2026-00001", refId: "ref-1" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const prev = {
      p: process.env.EINVOICE_PROVIDER,
      u: process.env.EINVOICE_API_URL,
      k: process.env.EINVOICE_API_KEY,
    };
    process.env.EINVOICE_PROVIDER = "test";
    process.env.EINVOICE_API_URL = "https://einvoice.test/api";
    process.env.EINVOICE_API_KEY = "k";
    try {
      const bigRow = {
        id: "inv-9",
        orderCode: order.code,
        amountVnd: BigInt(3654000000),
        buyerName: order.customerName,
        buyerEmail: "a@example.com",
        status: "PENDING_ISSUE",
      };
      const prisma = makePrisma({
        invoice: {
          findUnique: vi.fn().mockResolvedValue(bigRow),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      const svc = new InvoiceService(asPrisma(prisma));
      await svc.issueViaProvider("inv-9");
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]).amount).toBe(3654000000);
    } finally {
      vi.unstubAllGlobals();
      process.env.EINVOICE_PROVIDER = prev.p;
      process.env.EINVOICE_API_URL = prev.u;
      process.env.EINVOICE_API_KEY = prev.k;
    }
  });
});
