import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RequestIdMiddleware } from './observability';

function mockReqRes(headerValue?: string | string[]) {
  const headers: string[] = [];
  return {
    req: {
      method: 'GET',
      originalUrl: '/products',
      headers: { 'x-request-id': headerValue },
      cookies: {},
      requestId: undefined as string | undefined,
    },
    res: {
      setHeader: (k: string, v: string) => headers.push(`${k}=${v}`),
      on: vi.fn(),
    },
    headers,
  };
}

describe('RequestIdMiddleware honor incoming x-request-id', () => {
  beforeEach(() => vi.clearAllMocks());
  const mw = new RequestIdMiddleware();
  const next = vi.fn();

  it('id FE/agent gửi (hợp lệ) được giữ nguyên để nối trace xuyên service', () => {
    const { req, res, headers } = mockReqRes('trace_2026-abc.01');
    mw.use(req as never, res as never, next);
    expect(req.requestId).toBe('trace_2026-abc.01');
    expect(next).toHaveBeenCalled();
    expect(headers).toContain('X-Request-Id=trace_2026-abc.01');
  });

  it('id bẩn (header injection / quá ngắn / quá dài) → sinh id mới an toàn', () => {
    for (const bad of [
      'a',
      'abc\r\nX-Injected: 1',
      '<script>alert(1)</script>',
      'x'.repeat(200),
    ]) {
      const { req } = mockReqRes(bad);
      mw.use(req as never, { setHeader: vi.fn(), on: vi.fn() } as never, next);
      expect(req.requestId).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('không có header → sinh id mới (hành vi cũ)', () => {
    const { req, headers } = mockReqRes(undefined);
    mw.use(req as never, { setHeader: (k: string, v: string) => headers.push(`${k}=${v}`), on: vi.fn() } as never, next);
    expect(req.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(headers).toContain(`X-Request-Id=${req.requestId}`);
  });
});
