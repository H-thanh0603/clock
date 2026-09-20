import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service';
import { signParams } from '../common/vnpay';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotifyService } from '../notify/notify.service';
import type { InvoiceService } from '../invoices/invoice.service';

/**
 * Test tầng PaymentsService (P2-5): mapping outcome settle → redirect URL
 * (return) / RspCode (IPN), notify + invoice chỉ chạy khi success thật.
 * Logic guard checksum/amount/idempotent đã có test ở vnpay.test.ts.
 */

const HASH_SECRET = 'test-hash-secret-32-chars-abcdef';
const JWT = 'test-jwt-secret-du-32-ky-tu-abcdef';
const TXN = 'AC-2026-1-abc123';
const EXPECTED_VND = 25200000;

function signed(over: Record<string, string>) {
  const { hash } = signParams(over, HASH_SECRET);
  return { ...over, vnp_SecureHash: hash };
}

function baseQuery(responseCode: string) {
  return signed({
    vnp_TxnRef: TXN,
    vnp_Amount: String(EXPECTED_VND * 100),
    vnp_ResponseCode: responseCode,
  });
}

function makeDeps(paymentStatus = 'PENDING') {
  const payState = { status: paymentStatus };
  const orderState = { status: 'PENDING' };
  const orderRow = {
    id: 'ord-1',
    code: 'AC-2026-1',
    totalVnd: BigInt(EXPECTED_VND),
    totalUsd: 1000,
    userId: 'u-1',
    customerName: 'Khach',
    contact: '0901234567',
  };
  const tx = {
    payment: {
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        const win = payState.status === where.status;
        if (win) payState.status = data.status;
        return Promise.resolve({ count: win ? 1 : 0 });
      },
    },
    order: {
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        const win = orderState.status === where.status;
        if (win) orderState.status = data.status;
        return Promise.resolve({ count: win ? 1 : 0 });
      },
    },
    cartItem: { deleteMany: () => Promise.resolve({ count: 1 }) },
  };
  const prisma = {
    payment: {
      findFirst: ({ where }: { where: { txnRef: string } }) =>
        Promise.resolve(
          where.txnRef === TXN
            ? {
                id: 'pay-1',
                orderId: 'ord-1',
                status: payState.status,
                expectedVnd: BigInt(EXPECTED_VND),
              }
            : null,
        ),
    },
    order: {
      findUnique: ({ where }: { where: { id?: string; code?: string } }) =>
        Promise.resolve(
          where.id === 'ord-1' || where.code === 'AC-2026-1'
            ? { ...orderRow, status: orderState.status }
            : null,
        ),
      update: () => Promise.resolve({}),
    },
    cartItem: { deleteMany: () => Promise.resolve({ count: 0 }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  };
  const notify = { orderPaid: vi.fn(() => Promise.resolve()) };
  const invoices = { ensureForOrder: vi.fn(() => Promise.resolve({})) };
  const svc = new PaymentsService(
    prisma as unknown as PrismaService,
    notify as unknown as NotifyService,
    invoices as unknown as InvoiceService,
  );
  return { svc, notify, invoices, payState, orderState };
}

describe('PaymentsService.handleReturn', () => {
  const prevHash = process.env.VNPAY_HASH_SECRET;
  beforeAll(() => {
    process.env.VNPAY_HASH_SECRET = HASH_SECRET;
  });
  afterAll(() => {
    if (prevHash === undefined) delete process.env.VNPAY_HASH_SECRET;
    else process.env.VNPAY_HASH_SECRET = prevHash;
  });

  it('success → redirect paid=1 kèm sig + notify + invoice', async () => {
    const { svc, notify, invoices } = makeDeps();
    const url = await svc.handleReturn(baseQuery('00'));
    expect(url).toContain('/orders/AC-2026-1?paid=1');
    expect(url).toMatch(/&sig=[0-9a-f]{32}/);
    expect(notify.orderPaid).toHaveBeenCalledWith('AC-2026-1', EXPECTED_VND);
    expect(invoices.ensureForOrder).toHaveBeenCalled();
  });

  it('checksum sai → paid=0 reason=checksum, không notify/invoice', async () => {
    const { svc, notify, invoices } = makeDeps();
    const url = await svc.handleReturn({
      ...baseQuery('00'),
      vnp_SecureHash: '0'.repeat(128),
    });
    expect(url).toContain('paid=0');
    expect(url).toContain('reason=checksum');
    expect(notify.orderPaid).not.toHaveBeenCalled();
    expect(invoices.ensureForOrder).not.toHaveBeenCalled();
  });

  it('ResponseCode khác 00 → payment FAILED, reason=unpaid', async () => {
    const { svc, payState, orderState, notify } = makeDeps();
    const url = await svc.handleReturn(baseQuery('24'));
    expect(url).toContain('reason=unpaid');
    expect(payState.status).toBe('FAILED');
    expect(orderState.status).toBe('PENDING');
    expect(notify.orderPaid).not.toHaveBeenCalled();
  });

  it('payment đã settle trước → idempotent paid=1, không notify lại', async () => {
    const { svc, notify } = makeDeps('SUCCESS');
    const url = await svc.handleReturn(baseQuery('00'));
    expect(url).toContain('paid=1');
    expect(notify.orderPaid).not.toHaveBeenCalled();
  });

  it('DB throw giữa chừng → fallback /checkout?paid=0, không văng 500', async () => {
    // findFirst throw = downstream catch-all của handleReturn.
    const broken = {
      payment: {
        findFirst: () => Promise.reject(new Error('db down')),
      },
      order: { findUnique: () => Promise.resolve(null), update: () => Promise.resolve({}) },
      cartItem: { deleteMany: () => Promise.resolve({ count: 0 }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    };
    const svcBroken = new PaymentsService(
      broken as unknown as PrismaService,
      { orderPaid: vi.fn() } as unknown as NotifyService,
      { ensureForOrder: vi.fn() } as unknown as InvoiceService,
    );
    const url = await svcBroken.handleReturn(baseQuery('00'));
    expect(url).toContain('/checkout?paid=0');
  });
});

describe('PaymentsService.handleIpn', () => {
  const prevHash = process.env.VNPAY_HASH_SECRET;
  beforeAll(() => {
    process.env.VNPAY_HASH_SECRET = HASH_SECRET;
  });
  afterAll(() => {
    if (prevHash === undefined) delete process.env.VNPAY_HASH_SECRET;
    else process.env.VNPAY_HASH_SECRET = prevHash;
  });

  it('success → RspCode 00 + notify', async () => {
    const { svc, notify } = makeDeps();
    const r = await svc.handleIpn(baseQuery('00'));
    expect(r).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(notify.orderPaid).toHaveBeenCalled();
  });

  it('checksum sai → 97; amount lệch → 04; đã settle → 02', async () => {
    const { svc } = makeDeps();
    expect(
      await svc.handleIpn({ ...baseQuery('00'), vnp_SecureHash: 'bad' }),
    ).toEqual({ RspCode: '97', Message: 'Invalid checksum' });
    expect(
      await svc.handleIpn(
        signed({
          vnp_TxnRef: TXN,
          vnp_Amount: '1',
          vnp_ResponseCode: '00',
        }),
      ),
    ).toEqual({ RspCode: '04', Message: 'Invalid amount' });
    const settled = makeDeps('SUCCESS');
    expect(await settled.svc.handleIpn(baseQuery('00'))).toEqual({
      RspCode: '02',
      Message: 'Already confirmed',
    });
  });
});
