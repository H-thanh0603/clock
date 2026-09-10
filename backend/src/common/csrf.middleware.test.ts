import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { CsrfMiddleware, CSRF_COOKIE } from './csrf.middleware';

/**
 * Test CsrfMiddleware — double-submit cookie: POST/PATCH/PUT/DELETE cần
 * cookie khớp header; login/register/csrf được miễn. Trước đây 0 test
 * (audit TEST-001).
 */

function makeReqRes(
  method: string,
  path: string,
  opts: { cookie?: string; header?: string } = {},
) {
  const req = {
    method,
    originalUrl: path,
    url: path,
    cookies: opts.cookie ? { [CSRF_COOKIE]: opts.cookie } : {},
    headers: opts.header ? { 'x-csrf-token': opts.header } : {},
  } as never;
  const res = {} as never;
  const next = vi.fn();
  return { req, res, next };
}

const TOKEN = 'a'.repeat(32); // ≥16 ký tự hợp lệ

describe('CsrfMiddleware', () => {
  const mw = new CsrfMiddleware();

  it('POST thiếu cookie + header → 403 chặn', async () => {
    const { req, res, next } = makeReqRes('POST', '/orders');
    expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('POST có cookie mà thiếu header → 403', async () => {
    const { req, res, next } = makeReqRes('POST', '/orders', { cookie: TOKEN });
    expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
  });

  it('POST có header mà thiếu cookie → 403', async () => {
    const { req, res, next } = makeReqRes('POST', '/orders', { header: TOKEN });
    expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
  });

  it('cookie ≠ header (token lệch) → 403', async () => {
    const { req, res, next } = makeReqRes('POST', '/orders', {
      cookie: TOKEN,
      header: 'b'.repeat(32),
    });
    expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
  });

  it('cookie quá ngắn (<16) → 403 (token giả mỏng)', async () => {
    const { req, res, next } = makeReqRes('POST', '/orders', {
      cookie: 'short',
      header: 'short',
    });
    expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
  });

  it('cookie == header hợp lệ → next() cho qua', async () => {
    const { req, res, next } = makeReqRes('POST', '/orders', {
      cookie: TOKEN,
      header: TOKEN,
    });
    mw.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('PATCH/PUT/DELETE cũng bị kiểm tra', async () => {
    for (const m of ['PATCH', 'PUT', 'DELETE']) {
      const { req, res, next } = makeReqRes(m, '/cart/x');
      expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
    }
  });

  it('GET/HEAD/OPTIONS không cần token', async () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      const { req, res, next } = makeReqRes(m, '/products');
      mw.use(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('login/register/csrf được miễn (chưa có session để tấn công)', async () => {
    for (const p of ['/auth/login', '/auth/register', '/auth/csrf']) {
      const { req, res, next } = makeReqRes('POST', p);
      mw.use(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      next.mockClear();
    }
  });

  it('đường dẫn khác /auth/* KHÔNG được miễn', async () => {
    // regression: miễn phải exact-match, không prefix — /auth/xyz vẫn chặn.
    const { req, res, next } = makeReqRes('POST', '/auth/other');
    expect(() => mw.use(req, res, next)).toThrow(ForbiddenException);
  });

  it('query string không lách được whitelist (path so sau split ?)', async () => {
    const { req, res, next } = makeReqRes('POST', '/auth/login?next=/evil');
    mw.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    // ...nhưng path "trông giống" login với query lạ vẫn chặn đúng:
    const bad = makeReqRes('POST', '/orders?callback=/auth/login');
    expect(() => mw.use(bad.req, bad.res, bad.next)).toThrow(ForbiddenException);
  });
});
