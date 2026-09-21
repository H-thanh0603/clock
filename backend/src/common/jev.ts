/**
 * Jev (TypeSafe AI) — decision model cho backend web clock.
 *
 * Cùng 1 key/model với agent host (`agent/aurel_agents/jev.py`), nhưng gọi
 * trực tiếp từ NestJS cho các luồng web không đi qua agent:
 * - triage inquiry (spam gate + urgency + lead score)
 * - gợi ý filter khi search catalog rỗng
 * - cảnh báo rủi ro đơn hàng (advisory, không chặn)
 * - guardrail copy promotion/campaign (chặn mềm, không block)
 *
 * Quy tắc fail-safe (giống agent): thiếu JEV_API_KEY / Jev chết / timeout /
 * parse lỗi → trả null, caller GIỮ NGUYÊN hành vi cũ. Jev không bao giờ làm
 * hỏng luồng web — như Meili fallback Prisma.
 */

type JevAnswers = Record<
  string,
  { noul?: unknown; choice?: unknown; confidence?: unknown }
>;

function cfg() {
  const apiKey = process.env.JEV_API_KEY || '';
  if (!apiKey) return null;
  return {
    apiKey,
    url: (process.env.JEV_URL || 'https://api.typesafe.ai/v1/systemone').replace(
      /\/$/,
      '',
    ),
    model: process.env.JEV_MODEL || 'jev-latest',
    timeoutS: Number(process.env.JEV_TIMEOUT_S) || 5,
  };
}

/** 1 call Jev: state text + questions → answers. null = tắt/chết/timeout. */
async function ask(
  state: string,
  questions: Record<string, unknown>,
): Promise<JevAnswers | null> {
  const c = cfg();
  if (!c) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1, c.timeoutS) * 1000);
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: c.model,
        state: state.slice(0, 2000),
        questions,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { answers?: JevAnswers };
    return data?.answers && typeof data.answers === 'object'
      ? data.answers
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function asNoul(a: JevAnswers | null, key: string): number | null {
  const v = a?.[key]?.noul;
  return typeof v === 'number' ? v : null;
}

function asChoice(a: JevAnswers | null, key: string): string | null {
  const v = a?.[key]?.choice;
  return typeof v === 'string' ? v : null;
}

// --- 1. Inquiry triage + spam gate + bespoke lead -------------------------------

export type InquiryTriage = {
  /** spam chắc chắn → lưu status SPAM, khỏi ping Telegram/email. */
  isSpam: boolean;
  /** vip = gọi ngay; hot = ưu tiên trong ngày; normal/low = như cũ. */
  urgency: 'vip' | 'hot' | 'normal' | 'low';
  /** BESPOKE only: độ nghiêm túc của lead. */
  lead: 'hot' | 'warm' | 'cold' | null;
};

const SPAM_THRESHOLD = 0.85;

export async function triageInquiry(input: {
  type: string;
  name: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<InquiryTriage | null> {
  const state = JSON.stringify(
    {
      type: input.type,
      name: input.name,
      message: input.message ?? '',
      detail: input.payload ?? undefined,
    },
    null,
    0,
  );
  const a = await ask(state, {
    is_spam: {
      type: 'noul',
      instructions:
        'Form liên hệ này có phải spam / quảng cáo / bot / nội dung vô nghĩa không? Khách thật hỏi salon, bespoke, đồng hồ là KHÔNG spam.',
    },
    urgency: {
      type: 'choice',
      instructions: 'Mức ưu tiên phản hồi cho concierge?',
      criteria: {
        vip: 'Bespoke giá trị lớn, khách nhắc hẹn gấp, đơn bespoke đặt cọc',
        hot: 'Quan tâm thật, có ngân sách/sản phẩm cụ thể, cần gọi trong ngày',
        normal: 'Hỏi thông tin chung, đặt lịch thường',
        low: 'Vu vơ, chưa có nhu cầu rõ',
      },
    },
    lead_score: {
      type: 'choice',
      instructions: 'Nếu là đơn bespoke/salon: lead nghiêm túc tới đâu?',
      criteria: {
        hot: 'Cấu hình chi tiết + thông tin liên hệ đầy đủ',
        warm: 'Có quan tâm cụ thể nhưng thiếu thông tin',
        cold: 'Ghi chú trống/chung chung, khả năng tò mò',
      },
    },
  });
  if (!a) return null;
  const spam = asNoul(a, 'is_spam');
  const urgency = asChoice(a, 'urgency');
  const lead = asChoice(a, 'lead_score');
  return {
    isSpam: spam !== null && spam >= SPAM_THRESHOLD,
    urgency:
      urgency === 'vip' || urgency === 'hot' || urgency === 'low'
        ? urgency
        : 'normal',
    lead: lead === 'hot' || lead === 'warm' || lead === 'cold' ? lead : null,
  };
}

// --- 3. Search rỗng → gợi ý 1 filter --------------------------------------------

export type SearchHint = {
  /** filter FE collections page hiểu: material | movements | complications */
  kind: 'material' | 'movements' | 'complications';
  value: string;
  /** label tiếng Việt render nút gợi ý. */
  label: string;
};

const HINT_ALLOW: Record<SearchHint['kind'], Record<string, string>> = {
  material: {
    rose: 'Vàng Hồng 18K',
    platinum: 'Platinum 950',
    titanium: 'Titanium Gr.5',
    ceramic: 'Ceramic Carbon',
  },
  movements: {
    tourbillon: 'Tourbillon Mystérieux',
    automatic: 'Automatic Haute Calibre',
    manual: 'Lên Cót Tay',
    chrono: 'Chronograph Co-Axial',
  },
  complications: {
    perpetual: 'Lịch Vạn Niên',
    moonphase: 'Tuần Trăng Moonphase',
    repeater: 'Điểm Chuông Minute Repeater',
    skeleton: 'Lộ Cơ Skeleton',
  },
};

/** Query không ra gì → hỏi Jev xem khách đang tìm filter nào. Chỉ chạy khi rỗng. */
export async function searchHint(q: string): Promise<SearchHint | null> {
  const a = await ask(q, {
    movements: {
      type: 'choice',
      instructions: 'Khách đang tìm bộ máy nào?',
      criteria: {
        tourbillon: 'Tourbillon, flying tourbillon',
        automatic: 'Automatic, tự động',
        manual: 'Lên cót tay, manual winding',
        chrono: 'Chronograph, flyback, thể thao bấm giờ',
      },
    },
    material: {
      type: 'choice',
      instructions: 'Chất liệu vỏ khách nhắc tới?',
      criteria: {
        rose: 'Vàng hồng, rose gold',
        platinum: 'Platinum, bạch kim',
        titanium: 'Titanium',
        ceramic: 'Ceramic, carbon',
      },
    },
    complications: {
      type: 'choice',
      instructions: 'Tính năng phức tạp khách nhắc tới?',
      criteria: {
        perpetual: 'Lịch vạn niên, perpetual calendar',
        moonphase: 'Moonphase, tuần trăng',
        repeater: 'Điểm chuông, minute repeater',
        skeleton: 'Skeleton, lộ cơ',
      },
    },
  });
  if (!a) return null;
  // Ưu tiên movements (filter mạnh nhất), rồi complications, rồi material.
  // Value phải thuộc allowlist cứng — Jev trả rác thì bỏ, FE không bao giờ
  // nhận link lạ.
  for (const kind of ['movements', 'complications', 'material'] as const) {
    const v = asChoice(a, kind);
    if (v && HINT_ALLOW[kind][v])
      return { kind, value: v, label: HINT_ALLOW[kind][v] };
  }
  return null;
}

// --- 4. Order risk advisory (không chặn, chỉ alert) -------------------------------

export type OrderRisk = { risky: boolean; reason: string | null };

export async function orderRisk(input: {
  totalUsd: number;
  itemCount: number;
  method: string;
  guest: boolean;
  hasCustom: boolean;
}): Promise<OrderRisk | null> {
  const a = await ask(JSON.stringify(input), {
    is_risky: {
      type: 'noul',
      instructions:
        'Đơn hàng này có dấu hiệu rủi ro cần merchant xem lại không (khách vãng lai + giá trị lớn, số lượng bất thường gom hàng, hàng custom giá client tự khai, test/spam)? Đơn COD nhỏ của khách quen là bình thường.',
    },
    risk_reason: {
      type: 'choice',
      instructions: 'Loại rủi ro chính?',
      criteria: {
        high_value_guest: 'Khách vãng lai, giá trị lớn, chưa từng mua',
        bulk_resale: 'Số lượng lớn bất thường, nghi gom hàng resell',
        custom_price: 'Hàng custom/bespoke, giá chờ duyệt',
        test_spam: 'Đơn test, spam, thông tin rác',
      },
    },
  });
  if (!a) return null;
  const score = asNoul(a, 'is_risky');
  return {
    risky: score !== null && score >= 0.8,
    reason: asChoice(a, 'risk_reason'),
  };
}

// --- 5. Admin copy guardrail (chặn mềm: cảnh báo, không block) --------------------

export type CopyCheck = { warning: string } | null;

/** Text KM/campaign có claim rủi ro (cam kết tuyệt đối, giảm giá gây hiểu lầm)? */
export async function copyCheck(kind: string, text: string): Promise<CopyCheck> {
  if (!text.trim()) return null;
  const a = await ask(`[${kind}] ${text}`, {
    is_risky_claim: {
      type: 'noul',
      instructions:
        'Text khuyến mãi/marketing này có claim rủi ro không (cam kết tuyệt đối kiểu "bảo hành trọn đời", giảm giá gây hiểu lầm, giá/số liệu sai, ngôn từ pháp lý nhạy cảm)?',
    },
    clarity: {
      type: 'choice',
      instructions: 'Text có rõ ràng cho khách không?',
      criteria: {
        clear: 'Rõ: tên, mức giảm, điều kiện, thời gian đầy đủ',
        vague: 'Mơ hồ: thiếu điều kiện/thời gian, khách dễ hiểu lầm',
        misleading: 'Gây hiểu lầm: claim quá đà hoặc mập mờ có chủ ý',
      },
    },
  });
  if (!a) return null;
  const risky = asNoul(a, 'is_risky_claim');
  const clarity = asChoice(a, 'clarity');
  if (risky !== null && risky >= 0.8)
    return { warning: 'Jev: text có claim rủi ro, kiểm tra lại trước khi chạy' };
  if (clarity === 'vague' || clarity === 'misleading')
    return { warning: `Jev: text ${clarity === 'vague' ? 'mơ hồ' : 'gây hiểu lầm'}, nên bổ sung điều kiện/thời gian` };
  return null;
}
