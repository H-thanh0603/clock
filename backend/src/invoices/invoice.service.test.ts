import { describe, expect, it, vi } from "vitest";
import { InvoiceService } from "./invoice.service";

/** Prisma stub — chỉ cần findUnique + create/update cho các path test. */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: "inv-1", ...data })
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as never;
}

const order = {
  code: "AC-2026-42",
  totalVnd: 3650000000,
  customerName: "Nguyễn Văn A",
  contact: "a@example.com",
};

describe("InvoiceService.ensureForOrder", () => {
  it("tạo invoice PENDING_ISSUE khi chưa có (không cấu hình provider)", async () => {
    const svc = new InvoiceService(makePrisma());
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
    const svc = new InvoiceService(prisma);
    const inv = await svc.ensureForOrder(order);
    expect(inv).toBe(existing);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("contact không phải email → buyerEmail null", async () => {
    const svc = new InvoiceService(makePrisma());
    const inv = await svc.ensureForOrder({ ...order, contact: "0901234567" });
    expect(inv.buyerEmail).toBeNull();
  });
});
