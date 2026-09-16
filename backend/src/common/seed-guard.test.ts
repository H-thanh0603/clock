import { describe, expect, it } from 'vitest';
import { isSeedManaged } from './seed-guard';

describe('isSeedManaged', () => {
  it('row vừa seed (createdAt ≈ updatedAt) → được update', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(isSeedManaged(t, t)).toBe(true);
    expect(isSeedManaged(t, new Date(t.getTime() + 30_000))).toBe(true);
  });

  it('admin đã sửa (updatedAt nhảy xa) → seed không được đụng', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const edited = new Date('2026-02-01T00:00:00Z');
    expect(isSeedManaged(created, edited)).toBe(false);
  });
});
