/**
 * Phân tích event stream (SSE) từ agent host (agent/aurel_agents/host.py).
 *
 * Hợp đồng: mỗi event 1 khối `data: {json}\n\n` (chuẩn upstream
 * commerce_common.streaming). Tách thành module thuần để test mà không cần
 * jsdom — trang /agent dùng parser này cho fetch stream.
 */

export type AgentRole = "shop" | "merchant";

export type AgentEvent =
  | { type: "session"; session_id: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; tool: string; id: string; label?: string }
  | { type: "tool_result"; tool: string; id: string; summary: string; is_error: boolean }
  | { type: "progress"; message: string }
  | { type: "ui"; component: string; payload: UxPayload }
  | { type: "cart_update"; cart: CartSnapshot }
  | { type: "change_update"; change: StagedChangeSnapshot }
  | { type: "memory"; facts: { fact: string }[] }
  | { type: "turn_complete"; stop_reason: string; usage?: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

export type UxPayload = {
  title?: string;
  layout?: string;
  intro?: string;
  /** present_products: {product, reason} đã enrich server-side */
  items?: { product: AgentProduct; reason?: string | null }[];
  /** present_comparison */
  entries?: { product: AgentProduct; note?: string | null }[];
  dimensions?: string[];
  recommended_product_id?: string;
  /** present_plan / digest */
  steps?: string[];
  /** present_guide */
  sections?: { heading: string; body: string }[];
  /** present_order_status */
  order_id?: string;
  summary?: string;
  next_step?: string;
  /** present_metrics */
  period?: string;
  picks?: {
    label: string;
    value: string;
    unit?: string;
    change_pct?: number | null;
    note?: string | null;
  }[];
  /** present_change_preview */
  change_id?: string;
  headline?: string;
  note?: string;
  suggestions?: string[];
};

/**
 * Product record agent trả về là bản serialization của ShoppingAgent's
 * Product (pydantic) — nhiều field hơn FE Product nhưng luôn có đủ các
 * field FE render (name/slug/images/priceUsd/collection/specs).
 */
export type AgentProduct = {
  slug: string;
  name: string;
  collection?: string;
  title?: string;
  price?: number;
  priceUsd?: number;
  image_url?: string;
  images?: string[];
  short_description?: string;
  specs?: { label: string; value: string }[];
  [key: string]: unknown;
};

export type CartSnapshot = {
  items?: {
    product_id: string;
    title: string;
    quantity: number;
    price: number;
    option_values?: Record<string, string>;
  }[];
  currency?: string;
};

export type StagedChangeSnapshot = {
  change_id: string;
  kind: string;
  status: string;
  summary: string;
  items?: { target: string; field: string; before: unknown; after: unknown }[];
};

/**
 * Chuyển event JSON → AgentEvent, bỏ qua event lạ/không hợp lệ (đúng tinh
 * thần "hosts render the event types below and ignore any they do not know").
 */
export function parseAgentEvent(raw: string): AgentEvent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AgentEvent;
    return parsed && typeof parsed === "object" && "type" in parsed ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * State reducer cho một turn: ghép text, giữ component ui cuối cùng, status
 * line (progress/tool_call label), cart, staged change, session_id.
 * Trang dùng hook bọc cái này — mọi logic stream test được ở đây.
 */
export type TurnAccumulator = {
  text: string;
  session_id: string | null;
  status: string | null;
  ui: { component: string; payload: UxPayload }[];
  cart: CartSnapshot | null;
  change: StagedChangeSnapshot | null;
  errors: string[];
  done: boolean;
  memoryFacts: string[];
};

export function emptyAccumulator(): TurnAccumulator {
  return {
    text: "",
    session_id: null,
    status: null,
    ui: [],
    cart: null,
    change: null,
    errors: [],
    done: false,
    memoryFacts: [],
  };
}

export function applyEvent(acc: TurnAccumulator, ev: AgentEvent | null): TurnAccumulator {
  if (!ev) return acc;
  switch (ev.type) {
    case "session":
      return { ...acc, session_id: ev.session_id };
    case "text_delta":
      return { ...acc, text: acc.text + ev.text };
    case "progress":
      return { ...acc, status: ev.message };
    case "tool_call":
      return ev.label ? { ...acc, status: ev.label } : acc;
    case "tool_result":
      return { ...acc, status: null };
    case "ui":
      return { ...acc, ui: [...acc.ui, { component: ev.component, payload: ev.payload }] };
    case "cart_update":
      return { ...acc, cart: ev.cart };
    case "change_update":
      return { ...acc, change: ev.change };
    case "memory":
      return { ...acc, memoryFacts: [...acc.memoryFacts, ...ev.facts.map((f) => f.fact)] };
    case "error":
      return { ...acc, errors: [...acc.errors, ev.message] };
    case "turn_complete":
      return { ...acc, status: null };
    case "done":
      return { ...acc, done: true, status: null };
    default:
      return acc;
  }
}

/**
 * Đọc toàn bộ SSE body (string) về list event — dùng cho test và cho
 * fallback khi ReadableStream không có.
 */
export function parseSseBody(body: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const block of body.split("\n\n")) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const ev = parseAgentEvent(line.replace(/^data:\s?/, ""));
      if (ev) out.push(ev);
    }
  }
  return out;
}

/**
 * Tiện ích giá: payload agent trả price (USD, chuẩn backend); trang hiển thị
 * USD — same source-of-truth với PricingProvider.
 */
export function agentPrice(p: AgentProduct): number {
  return p.priceUsd ?? p.price ?? 0;
}
