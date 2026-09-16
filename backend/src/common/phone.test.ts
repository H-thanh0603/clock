import { describe, expect, it } from 'vitest';
import { normalizeVnPhone, sameContact } from './phone';

describe('normalizeVnPhone', () => {
  it.each([
    ['0901234567', '0901234567'],
    ['+84901234567', '0901234567'],
    ['84901234567', '0901234567'],
    ['0084901234567', '0901234567'],
    ['090 123 4567', '0901234567'],
    ['090-123-4567', '0901234567'],
    ['090.123.4567', '0901234567'],
    ['(+84) 901-234-567', '0901234567'],
    ['0371234567', '0371234567'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeVnPhone(raw)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'a@example.com',
    '0241234567', // cố định Hà Nội — không ép di động
    '12345',
    '+11234567890', // số Mỹ
    '8490123456', // thiếu số
  ])('%s → null', (raw) => {
    expect(normalizeVnPhone(raw)).toBeNull();
  });
});

describe('sameContact', () => {
  it('cùng SĐT khác cách viết → true', () => {
    expect(sameContact('0901234567', '+84901234567')).toBe(true);
    expect(sameContact('090 123 4567', '84901234567')).toBe(true);
  });

  it('email không phân biệt hoa thường', () => {
    expect(sameContact('A@Example.com', 'a@example.com')).toBe(true);
  });

  it('khác nhau → false; rỗng → false', () => {
    expect(sameContact('0901234567', '0901234568')).toBe(false);
    expect(sameContact('', '0901234567')).toBe(false);
    expect(sameContact('a@x.com', 'b@x.com')).toBe(false);
  });
});
