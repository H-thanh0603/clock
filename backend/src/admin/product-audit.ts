import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

// Ngưỡng cắt value trong audit diff — specs/narrative có thể dài,
// 1 event không được phình ra.
const DIFF_VALUE_MAX = 500;

/** Value đã JSON-safe cho audit diff — không unknown, không BigInt. */
export type DiffValue =
  | string
  | number
  | boolean
  | null
  | DiffValue[]
  | { [k: string]: DiffValue };

/**
 * Diff old→new cho audit trail (trước đây chỉ ghi tên field đổi, admin
 * không thấy giá đổi từ đâu về đâu).
 *
 * Chỉ ghi field thực sự khác, value đã JSON-safe (BigInt/undefined bị loại),
 * và cắt bớt value quá lớn — summary vẫn liệt kê đủ tên field.
 */
export function productDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, { from: DiffValue; to: DiffValue }> {
  const safe = (v: unknown): DiffValue => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'string')
      return v.length > DIFF_VALUE_MAX ? `${v.slice(0, DIFF_VALUE_MAX)}…` : v;
    if (typeof v === 'boolean' || typeof v === 'number') return v;
    if (Array.isArray(v))
      return (v.length > 20 ? [...v.slice(0, 20), `…+${v.length - 20}`] : v) as DiffValue[];
    if (typeof v === 'object') {
      let s: string;
      try {
        s = JSON.stringify(v) ?? 'null';
      } catch {
        return String(v);
      }
      if (s.length > DIFF_VALUE_MAX) return `${s.slice(0, DIFF_VALUE_MAX)}…`;
      try {
        return JSON.parse(s) as DiffValue;
      } catch {
        return s.slice(0, DIFF_VALUE_MAX);
      }
    }
    return String(v);
  };
  const out: Record<string, { from: DiffValue; to: DiffValue }> = {};
  // BigInt không JSON.stringify được → so sánh bằng chuỗi có gắn kiểu.
  const same = (a: unknown, b: unknown) => {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return String(a) === String(b);
    }
  };
  for (const f of fields) {
    const a = before?.[f] ?? null;
    const b = after?.[f] ?? null;
    if (same(a, b)) continue;
    out[f] = { from: safe(a), to: safe(b) };
  }
  return out;
}

/** Ghi 1 ProductEvent audit — nối actor (người/agent) với thay đổi. */
export async function auditEvent(
  prisma: PrismaService,
  data: {
    slug: string;
    action: string;
    byUserId?: string;
    summary?: string;
    changes?: Record<string, { from: DiffValue; to: DiffValue }>;
  },
) {
  await prisma.productEvent.create({
    data: {
      slug: data.slug,
      action: data.action,
      byUserId: data.byUserId ?? null,
      summary: data.summary,
      changes: (data.changes ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
