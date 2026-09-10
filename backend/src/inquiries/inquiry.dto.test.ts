import { describe, expect, it } from 'vitest';
import {
  normalizePayload,
  PAYLOAD_MAX_BYTES,
} from './inquiry.dto';

describe('normalizePayload', () => {
  it('giữ nguyên payload scalar hợp lệ', () => {
    const p = normalizePayload({
      movement: 'tourbillon',
      case: 'rose gold',
      estimatedUsd: 42000,
    });
    expect(p).toEqual({
      movement: 'tourbillon',
      case: 'rose gold',
      estimatedUsd: 42000,
    });
  });

  it('null/undefined/array/string → null (không phải object config)', () => {
    expect(normalizePayload(null)).toBeNull();
    expect(normalizePayload(undefined)).toBeNull();
    expect(normalizePayload([1, 2])).toBeNull();
    expect(normalizePayload('abc')).toBeNull();
  });

  it('payload khổng lồ bị cắt về dưới 4KB', () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 40; i++)
      big[`field_${i}`] = 'x'.repeat(500); // ~20KB serialized
    const p = normalizePayload(big);
    expect(p).not.toBeNull();
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(
      PAYLOAD_MAX_BYTES,
    );
  });

  it('lồng sâu quá 3 tầng bị thay bằng [...]', () => {
    const p = normalizePayload({
      a: { b: { c: { d: { secret: 'deep' } } } },
    }) as Record<string, unknown>;
    const a = p.a as Record<string, unknown>;
    const b = a.b as Record<string, unknown>;
    expect(JSON.stringify(b.c)).toContain('...');
  });

  it('HTML trong key/value bị render đã escape ở controller (payload vẫn giữ nguyên)', () => {
    const p = normalizePayload({
      note: '<b>bold</b>',
    });
    expect(p).toEqual({ note: '<b>bold</b>' });
  });

  it('giới hạn 30 key + mảng 10 phần tử', () => {
    const bigObj: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) bigObj[`k${i}`] = i;
    const p = normalizePayload(bigObj) as Record<string, unknown>;
    expect(Object.keys(p).length).toBe(30);

    const q = normalizePayload({
      arr: Array.from({ length: 50 }, (_, i) => i),
    }) as { arr: unknown[] };
    expect(q.arr.length).toBe(10);
  });
});
