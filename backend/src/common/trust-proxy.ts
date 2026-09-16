/**
 * Trust-proxy cho Express sau Caddy (audit SEC-CRIT-02).
 *
 * Vấn đề: @nestjs/throttler lấy identity bằng `req.ip`. Không set trust
 * proxy thì `req.ip` luôn là IP socket trực tiếp = container Caddy → mọi
 * user chia chung 1 bucket (login 10/phút thành ngân sách chung cả site:
 * attacker login fail 10 lần là khóa login của mọi khách thật).
 *
 * Vì sao không dùng 'loopback': Caddy nối tới backend qua docker bridge
 * (172.18.0.x), KHÔNG phải 127.0.0.1 → 'loopback' không trust Caddy, bug
 * vẫn còn. Vì sao không dùng `true`/số hop: mở cửa cho XFF giả khi ai đó
 * nối thẳng tới backend (dev publish port 4000).
 *
 * Function này trust loopback + RFC1918 + ULA IPv6 (dải của docker bridge,
 * LAN proxy nội bộ), coi entry công cộng đầu tiên từ phải sang là client
 * thật. Caddy append IP thật vào CUỐI XFF nên entry cuối-do-Caddy-thêm
 * (socket peer) luôn nằm trong dải trust → req.ip = client công cộng.
 */
export function isTrustedProxyIp(ip: string): boolean {
  const v = (ip ?? '').trim().toLowerCase();
  if (!v) return false;
  // Bóc lớp IPv4-mapped IPv6 (::ffff:1.2.3.4) để check dải IPv4 bên trong.
  const inner = v.startsWith('::ffff:') ? v.slice('::ffff:'.length) : v;
  if (inner === '127.0.0.1' || inner === '::1' || v === '::1') return true;
  if (inner.startsWith('127.')) return true;
  if (inner.startsWith('10.')) return true;
  if (inner.startsWith('192.168.')) return true;
  // 172.16.0.0/12 — docker bridge mặc định (172.18.0.x, 172.19.0.x...).
  const m172 = /^172\.(\d{1,3})\./.exec(inner);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 ULA (fc00::/7: byte đầu 0xFC/0xFD) — mạng nội bộ IPv6.
  // Chỉ áp cho chuỗi có ':' để không nhầm hostname thường.
  if (v.includes(':') && (v.startsWith('fc') || v.startsWith('fd')))
    return true;
  return false;
}

/** Giá trị truyền vào `app.set('trust proxy', ...)` của Express. */
export function trustProxySetting(
  ip: string,
): boolean {
  return isTrustedProxyIp(ip);
}
