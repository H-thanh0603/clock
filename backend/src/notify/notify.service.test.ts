import { describe, expect, it, vi } from 'vitest';
import { NotifyService } from './notify.service';

/**
 * Test hàng đợi notify: enqueue không chờ gửi, fail thì retry với
 * backoff, quá MAX_ATTEMPTS thì bỏ + log error (không throw).
 */

const ORDER = {
  code: 'AC-2026-1',
  status: 'PENDING',
  customerName: 'Test',
  contact: 'khach@example.com',
  totalUsd: 1000,
  totalVnd: 25_000_000_000,
  paidUsd: 0,
  method: 'vnpay',
  itemCount: 1,
};

function makeNotify(telegramImpl: (...args: never[]) => Promise<boolean>) {
  const svc = new NotifyService();
  // Đứng queue từ orderCreated: override send thật bằng impl test.
  (svc as unknown as { telegram: unknown }).telegram = vi.fn(telegramImpl);
  return svc;
}

describe('NotifyService hàng đợi retry', () => {
  it('orderCreated trả NGAY (không await telegram) và gửi qua queue', async () => {
    const sent: string[] = [];
    const svc = makeNotify(async (text: string) => {
      sent.push(text);
      return true;
    });
    const t0 = Date.now();
    await svc.orderCreated(ORDER);
    // Không đợi SMTP/Telegram thật — trả trong vài ms.
    expect(Date.now() - t0).toBeLessThan(100);
    await svc.drainForTest();
    expect(sent.length).toBeGreaterThanOrEqual(1); // telegram
    expect(sent[0]).toContain('AC-2026-1');
  });

  it('thất bại tạm thời → retry cho tới khi thành công', async () => {
    let calls = 0;
    const svc = makeNotify(async () => {
      calls++;
      return calls >= 3; // fail 2 lần rồi thành công
    });
    await svc.orderCreated(ORDER);
    await svc.drainForTest();
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('fail liền 3 lần (MAX_ATTEMPTS) → bỏ + KHÔNG throw', async () => {
    let calls = 0;
    const svc = makeNotify(async () => {
      calls++;
      throw new Error('SMTP down');
    });
    await svc.orderCreated(ORDER);
    await expect(svc.drainForTest()).resolves.toBeUndefined();
    expect(calls).toBeGreaterThanOrEqual(3); // đã thử đủ
    expect(calls).toBeLessThan(10); // nhưng không retry vô hạn
  });

  it('email chỉ gửi khi contact là email hợp lệ', async () => {
    const emails: string[] = [];
    const svc = new NotifyService();
    (svc as unknown as { email: unknown }).email = vi.fn(
      async (to: string) => {
        emails.push(to);
        return true;
      },
    );
    await svc.orderCreated({ ...ORDER, contact: '0901234567' }); // SĐT → chỉ telegram
    await svc.drainForTest();
    expect(emails).toHaveLength(0);

    await svc.orderCreated(ORDER);
    await svc.drainForTest();
    expect(emails).toEqual(['khach@example.com']);
  });
});
