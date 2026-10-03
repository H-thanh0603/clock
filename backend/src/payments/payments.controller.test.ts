import { describe, expect, it } from 'vitest';
import {
  PaymentIntentsController,
  PaymentsController,
  PaymentsMethodsController,
} from './payments.controller';
import type { PaymentsService } from './payments.service';
import { ForbiddenException } from '@nestjs/common';

/**
 * Controller payments — mapping request → service, logic mỏng:
 * - /methods: fail-closed theo env (prod chỉ vnpay)
 * - intents: ADMIN không được dùng "thanh toán hộ" của user
 * - vnpay return: redirect URL service trả; ipn: passthrough query
 */
describe('PaymentsMethodsController.methods', () => {
  const ctl = new PaymentsMethodsController();

  it('prod → chỉ vnpay', () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(ctl.methods()).toEqual({ methods: ['vnpay'] });
    process.env.NODE_ENV = old;
  });

  it('dev → đủ method mô phỏng', () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const { methods } = ctl.methods();
    expect(methods).toContain('vnpay');
    expect(methods.length).toBeGreaterThan(1);
    process.env.NODE_ENV = old;
  });
});

describe('PaymentIntentsController', () => {
  function makeCtl() {
    const calls: { id: string; body: unknown }[] = [];
    const svc = {
      createIntent: (id: string, body: unknown) => {
        calls.push({ id, body });
        return Promise.resolve({ id: 'intent-1' });
      },
      listIntents: (id: string) => Promise.resolve({ mine: id }),
      revokeIntent: (id: string, intent: string) =>
        Promise.resolve({ revoked: `${id}/${intent}` }),
    } as unknown as PaymentsService;
    return { ctl: new PaymentIntentsController(svc), calls };
  }

  it('ADMIN tạo intent hộ → 403', () => {
    const { ctl, calls } = makeCtl();
    // controller throw sync (không async) — ForbiddenException đồng bộ
    expect(() =>
      ctl.create({ maxUsd: 100 }, { id: 'a', role: 'ADMIN' } as never),
    ).toThrow(ForbiddenException);
    expect(calls).toHaveLength(0); // chưa chạm service
  });

  it('user thường → passthrough user.id + body', async () => {
    const { ctl, calls } = makeCtl();
    await ctl.create({ maxUsd: 500 }, { id: 'u-1', role: 'USER' } as never);
    expect(calls).toEqual([{ id: 'u-1', body: { maxUsd: 500 } }]);
  });

  it('mine/revoke passthrough đúng user', async () => {
    const { ctl } = makeCtl();
    await expect(ctl.mine({ id: 'u-1' } as never)).resolves.toEqual({
      mine: 'u-1',
    });
    await expect(ctl.revoke('i-9', { id: 'u-1' } as never)).resolves.toEqual({
      revoked: 'u-1/i-9',
    });
  });
});

describe('PaymentsController return/ipn mapping', () => {
  function makeCtl(url = '/checkout?paid=1') {
    const svc = {
      createPayUrl: () => Promise.resolve({ url: 'https://vnp/pay' }),
      handleReturn: (q: unknown) => Promise.resolve(url + JSON.stringify(q).length),
      handleIpn: (q: unknown) => Promise.resolve({ RspCode: '00', q }),
    } as unknown as PaymentsService;
    return new PaymentsController(svc);
  }

  it('return → 302 redirect URL service trả', async () => {
    const ctl = makeCtl('/checkout?paid=1');
    let redirected = '';
    const res = { redirect: (u: string) => (redirected = u) };
    await ctl.vnpayReturn({ a: '1' } as never, res as never);
    expect(redirected.startsWith('/checkout?paid=1')).toBe(true);
  });

  it('ipn → passthrough query nguyên vẹn', async () => {
    const ctl = makeCtl();
    const r = await ctl.ipn({ vnp_TxnRef: 'T1' } as never);
    expect(r).toEqual({ RspCode: '00', q: { vnp_TxnRef: 'T1' } });
  });

  it('create → passthrough orderId/contact + user có thể null', async () => {
    const ctl = makeCtl();
    const r = await ctl.create(
      { orderId: 'o-1', contact: 'c' },
      null,
      {} as never,
    );
    expect(r).toEqual({ url: 'https://vnp/pay' });
  });
});
