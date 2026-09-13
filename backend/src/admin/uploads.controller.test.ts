import { describe, expect, it } from 'vitest';
import { resolveUploadExt } from './uploads.controller';

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
