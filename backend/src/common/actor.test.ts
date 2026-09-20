import { describe, expect, it } from 'vitest';
import { resolveActor, type SessionUser } from './session';

/**
 * Actor attribution (NV-4): browser KHÔNG thể giả danh agent, và agent
 * delegation chỉ được ghi id:agent/... khi header khớp whitelist.
 */
const browser: SessionUser = {
  id: 'u-browser',
  email: 'a@x',
  role: 'CUSTOMER',
  v: 0,
};
const viaAgent: SessionUser = { ...browser, id: 'u-agent', viaAgent: true };

describe('resolveActor', () => {
  it('khách (không phiên) → undefined', () => {
    expect(resolveActor(null, 'agent/shopping')).toBeUndefined();
  });

  it('browser luôn dùng id phiên, bỏ qua header x-aurel-actor', () => {
    expect(resolveActor(browser, 'agent/shopping')).toBe('u-browser');
    expect(resolveActor(browser, undefined)).toBe('u-browser');
  });

  it('delegation + header hợp lệ → ghi id:agent/...', () => {
    expect(resolveActor(viaAgent, 'agent/shopping')).toBe('agent/shopping');
    expect(resolveActor(viaAgent, '  agent/merchant-7  ')).toBe(
      'agent/merchant-7',
    );
  });

  it('delegation + header sai định dạng → fallback về id user', () => {
    for (const bad of [
      'agent shopping',
      'agent/',
      '/shopping',
      'agent/<script>',
      'a'.repeat(40) + '/x',
      '',
      undefined,
    ]) {
      expect(resolveActor(viaAgent, bad as string | undefined)).toBe('u-agent');
    }
  });

  it('không nhận chuỗi tự do dài (không nhét PII vào audit)', () => {
    expect(resolveActor(viaAgent, 'agent/' + 'x'.repeat(200))).toBe('u-agent');
  });
});
