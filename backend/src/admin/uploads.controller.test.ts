import { describe, expect, it } from 'vitest';
import { resolveUploadExt, sniffImageMime } from './uploads.controller';

describe('resolveUploadExt', () => {
  it.each([['anh.jpg', '.jpg'], ['ANH.JPEG', '.jpeg'], ['a.png', '.png'], ['a.webp', '.webp']])(
    'cho phép %s',
    (name, ext) => {
      expect(resolveUploadExt(name)).toBe(ext);
    },
  );

  it.each([['x.html', null], ['x.svg', null], ['x.php', null], ['x', null], ['x.jpg.exe', null], ['', null]])(
    'chặn %s (XSS/masquerade)',
    (name, expected) => {
      expect(resolveUploadExt(name as string)).toBe(expected);
    },
  );
});

describe('sniffImageMime (magic bytes)', () => {
  it('nhận JPEG/PNG/WebP thật', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP'),
    ]);
    expect(sniffImageMime(webp)).toBe('image/webp');
  });

  it('chặn polyglot: .jpg chứa HTML/SVG → null', () => {
    expect(sniffImageMime(Buffer.from('<html><script>x</script>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageMime(Buffer.from('RIFF____AVI '))).toBeNull(); // RIFF nhưng không WEBP
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});
