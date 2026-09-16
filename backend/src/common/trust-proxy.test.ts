import { describe, expect, it } from 'vitest';
import express from 'express';
import { isTrustedProxyIp } from './trust-proxy';

/**
 * Test trust-proxy (audit SEC-CRIT-02): throttler dùng `req.ip` nên phải
 * phân biệt đúng proxy nội bộ vs client công cộng.
 */
describe('isTrustedProxyIp', () => {
  it.each([
    '127.0.0.1',
    '127.0.0.2',
    '::1',
    '::ffff:127.0.0.1',
    '10.0.0.5',
    '192.168.1.10',
    // Docker bridge mặc định.
    '172.18.0.3',
    '172.19.0.2',
    '172.16.0.1',
    '172.31.255.255',
    '::ffff:10.1.2.3',
    'fd00::1',
  ])('trust proxy nội bộ: %s', (ip) => {
    expect(isTrustedProxyIp(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.2.3.4',
    '203.0.113.10',
    // 172.15.x / 172.32.x KHÔNG thuộc 172.16/12.
    '172.15.0.1',
    '172.32.0.1',
    '',
  ])('không trust IP công cộng: %s', (ip) => {
    expect(isTrustedProxyIp(ip)).toBe(false);
  });
});

describe('express req.ip sau trust proxy', () => {
  // Mô phỏng: client công cộng → Caddy (172.18.0.2) → backend.
  // Caddy append IP thật vào cuối XFF; socket peer là IP bridge.
  it('req.ip là client thật, không phải IP Caddy', async () => {
    const app = express();
    const { trustProxySetting } = await import('./trust-proxy');
    app.set('trust proxy', trustProxySetting);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const server = await new Promise<ReturnType<typeof app.listen>>(
      (resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      },
    );
    try {
      const port = (server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/ip`, {
        headers: { 'x-forwarded-for': '203.0.113.77, 172.18.0.2' },
      });
      const body = (await res.json()) as { ip: string };
      // Socket 127.0.0.1 (trust) + 172.18.0.2 (trust) → client 203.0.113.77.
      expect(body.ip).toBe('203.0.113.77');
    } finally {
      server.close();
    }
  });

  it('không có XFF thì req.ip là socket peer', async () => {
    const app = express();
    const { trustProxySetting } = await import('./trust-proxy');
    app.set('trust proxy', trustProxySetting);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const server = await new Promise<ReturnType<typeof app.listen>>(
      (resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      },
    );
    try {
      const port = (server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/ip`);
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe('127.0.0.1');
    } finally {
      server.close();
    }
  });
});
