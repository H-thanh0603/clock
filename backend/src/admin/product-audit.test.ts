import { describe, expect, it } from 'vitest';
import { productDiff } from './product-audit';

describe('productDiff (audit diff old/new)', () => {
  it('chỉ ghi field thực sự đổi, kèm from/to', async () => {
    const { productDiff } = await import('./product-audit');
    const before = { priceUsd: 100, name: 'A', stock: 5 };
    const after = { priceUsd: 120, name: 'A', stock: 5 };
    expect(productDiff(before, after, ['priceUsd', 'name', 'stock'])).toEqual({
      priceUsd: { from: 100, to: 120 },
    });
  });

  it('không đổi gì → {} (summary vẫn là no-change)', async () => {
    const { productDiff } = await import('./product-audit');
    const row = { priceUsd: 100 };
    expect(productDiff(row, { ...row }, ['priceUsd'])).toEqual({});
  });

  it('null vs giá trị là 1 thay đổi (bật/tắt field optional)', async () => {
    const { productDiff } = await import('./product-audit');
    expect(productDiff({ narrative: null }, { narrative: 'x' }, ['narrative']))
      .toEqual({ narrative: { from: null, to: 'x' } });
  });

  it('value dài bị cắt, mảng lớn bị rút gọn — event không phình', async () => {
    const { productDiff } = await import('./product-audit');
    const diff = productDiff(
      { narrative: 'a'.repeat(900), specs: new Array(50).fill('s') },
      { narrative: 'b'.repeat(900), specs: new Array(50).fill('t') },
      ['narrative', 'specs'],
    );
    expect(String(diff.narrative.to)).toHaveLength(501);
    expect(Array.isArray(diff.specs.to)).toBe(true);
    expect((diff.specs.to as unknown[]).length).toBe(21);
  });

  it('bigint (giá VND lớn) chuyển được sang JSON', async () => {
    const { productDiff } = await import('./product-audit');
    const diff = productDiff(
      { priceVnd: BigInt(1) },
      { priceVnd: BigInt(2) },
      ['priceVnd'],
    );
    expect(() => JSON.stringify(diff)).not.toThrow();
    expect(diff.priceVnd).toEqual({ from: 1, to: 2 });
  });
});
