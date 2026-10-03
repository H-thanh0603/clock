import { describe, expect, it } from 'vitest';
import { AdminFinanceService } from './admin-finance.service';

describe('AdminFinanceService.metrics', () => {
  it('sales map rows thành points ngày', async () => {
    const prisma = {
      $queryRaw: () =>
        Promise.resolve([
          { bucket: new Date('2026-09-10T00:00:00Z'), value: BigInt(1500) },
          { bucket: new Date('2026-09-11T00:00:00Z'), value: BigInt(200) },
        ]),
    };
    const svc = new AdminFinanceService(prisma as never, {} as never);
    const r = await svc.metrics('sales', 'day', 30);
    expect(r.points).toEqual([
      { date: '2026-09-10', value: 1500 },
      { date: '2026-09-11', value: 200 },
    ]);
  });

  it('metric lạ trả points rỗng (không bịa số)', async () => {
    const svc = new AdminFinanceService({} as never, {} as never);
    const r = await svc.metrics('traffic', 'day', 30);
    expect(r.points).toEqual([]);
  });
});
describe('AdminFinanceService.invoices', () => {
  function invPrisma(rows: Record<string, unknown>[] = []) {
    const store = new Map(rows.map((r) => [(r as { id: string }).id, { ...r }]));
    const created: unknown[] = [];
    return {
      invoice: {
        count: () => Promise.resolve(store.size),
        findMany: () => Promise.resolve([...store.values()]),
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(store.get(where.id) ?? null),
        update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const cur = store.get(where.id);
          if (!cur) throw new Error('not found');
          const next = { ...cur, ...data };
          store.set(where.id, next);
          return Promise.resolve(next);
        },
      },
      productEvent: { create: (a: unknown) => { created.push(a); return Promise.resolve(a); } },
      created,
      store,
    };
  }
  const svcOf = (p: ReturnType<typeof invPrisma>) =>
    new AdminFinanceService(p as never, {} as never);
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    orderCode: 'AC-2026-000001',
    number: null,
    externalRef: null,
    status: 'PENDING_ISSUE',
    amountVnd: BigInt(2520000000),
    buyerName: 'Nguyen Van A',
    buyerEmail: null,
    createdAt: new Date(),
    issuedAt: null,
    ...over,
  });

  it('list: BigInt serialize Number, filter status lạ = all', async () => {
    const p = invPrisma([row(), row({ id: 'inv-2', status: 'ISSUED' })]);
    const r = await svcOf(p).listInvoices('LẠ' as never);
    expect(r.total).toBe(2);
    expect(typeof r.items[0].amountVnd).toBe('number');
  });

  it('ISSUED thiếu number → 400 (chống đánh dấu ẩu)', async () => {
    const p = invPrisma([row()]);
    await expect(svcOf(p).setInvoiceStatus('inv-1', { status: 'ISSUED' })).rejects.toThrow(
      /number/
    );
  });

  it('status lạ → 400; id lạ → 404', async () => {
    const p = invPrisma([row()]);
    await expect(svcOf(p).setInvoiceStatus('inv-1', { status: 'XONG' })).rejects.toThrow();
    await expect(
      svcOf(p).setInvoiceStatus('nope', { status: 'ISSUED', number: 'AUR-1' })
    ).rejects.toThrow();
  });

  it('ISSUED OK: ghi number + issuedAt + audit ProductEvent kèm actor', async () => {
    const p = invPrisma([row()]);
    const r = await svcOf(p).setInvoiceStatus(
      'inv-1',
      { status: 'ISSUED', number: 'AUR-2026-00001' },
      'admin-9'
    );
    expect(r.status).toBe('ISSUED');
    expect(r.issuedAt).toBeInstanceOf(Date);
    expect(p.created).toHaveLength(1);
    const ev = p.created[0] as { data: Record<string, unknown> };
    expect(ev.data.action).toBe('INVOICE_ISSUED');
    expect(ev.data.byUserId).toBe('admin-9');
  });

  it('FAILED cần externalRef để lần sau tra; retry gọi provider qua service', async () => {
    let retried: string | null = null;
    const p = invPrisma([row()]);
    const svc = new AdminFinanceService(
      p as never,
      { issueViaProvider: async (id: string) => { retried = id; } } as never
    );
    await svc.setInvoiceStatus('inv-1', { status: 'FAILED', externalRef: 'NCC: sai MST' });
    expect(p.store.get('inv-1')!.status).toBe('FAILED');
    await svc.retryInvoice('inv-1');
    expect(retried).toBe('inv-1');
  });

  it('ISSUED rồi đánh dấu lại → idempotent (không ghi đè issuedAt)', async () => {
    const issuedAt = new Date('2026-01-01');
    const p = invPrisma([row({ status: 'ISSUED', number: 'AUR-1', issuedAt })]);
    const r = await svcOf(p).setInvoiceStatus('inv-1', { status: 'ISSUED', number: 'AUR-1' });
    expect(new Date(r.issuedAt as unknown as string).toISOString()).toBe(issuedAt.toISOString());
    expect(p.created).toHaveLength(0);
  });
});
