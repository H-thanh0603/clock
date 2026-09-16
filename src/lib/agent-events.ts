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
  // memory: vendor trả MemoryFact {key, value} qua model_dump(); giữ
  // {fact} cho tương thích event cũ — đọc bằng memoryFactText().
  | { type: "memory"; facts: { fact?: string; key?: string; value?: string }[] }
  | { type: "handoff"; ticket_id: string; message: string }
  | { type: "delegation_expired"; message: string }
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
  /** watch_confirmed (set_watch): card xác nhận watch */
  watch_id?: string;
  confirmed?: string;
  baseline_price?: number | null;
  /** watch_confirmed / dùng chung cho các component khác */
  product_id?: string;
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
  handoff: { ticket_id: string; message: string } | null;
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
    handoff: null,
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
      return {
        ...acc,
        memoryFacts: [
          ...acc.memoryFacts,
          ...ev.facts.map(memoryFactText).filter((t) => t.length > 0),
        ],
      };
    case "handoff":
      return { ...acc, handoff: { ticket_id: ev.ticket_id, message: ev.message } };
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

/**
 * Chuẩn hóa 1 memory fact thành text hiển thị. Vendor MemoryFact là
 * {key, value} (model_dump, KHÔNG có field fact) — đọc thẳng f.fact sẽ ra
 * "undefined" trên UI. Hàm này chịu cả 2 shape.
 */
export function memoryFactText(f: {
  fact?: string;
  key?: string;
  value?: string;
}): string {
  if (typeof f.fact === "string" && f.fact.trim()) return f.fact.trim();
  const v = typeof f.value === "string" ? f.value.trim() : "";
  if (!v) return "";
  const k = typeof f.key === "string" ? f.key.trim() : "";
  return k ? `${k}: ${v}` : v;
}

/** Nhãn tiếng Việt cho tool vendor (dùng ở biên lai + status). */
const TOOL_LABELS: Record<string, string> = {
  search_products: "Tìm kiếm sản phẩm",
  get_product_details: "Xem chi tiết sản phẩm",
  get_cart: "Kiểm tra giỏ hàng",
  add_to_cart: "Thêm vào giỏ hàng",
  get_preferences: "Đọc sở thích đã nhớ",
  get_orders: "Tra cứu đơn hàng",
  get_order_status: "Tra cứu trạng thái đơn",
  search_policies: "Tra cứu chính sách",
  get_fulfillment_options: "Xem phương thức nhận hàng",
  set_watch: "Đặt theo dõi",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
}

/**
 * Biên lai cuối turn: từ event stream suy ra agent ĐÃ LÀM gì (không phải
 * ĐÃ NÓI gì) — chatbot không có thứ này để khoe. Trả về mảng dòng ngắn gọn;
 * mảng rỗng = turn tán gẫu thuần → không render gì.
 *
 * Ưu tiên số liệu giàu thông tin (tìm thấy N chiếc) hơn đếm tool thô
 * (tìm kiếm N lần) để tránh dòng trùng ý.
 */
export function buildReceipt(events: AgentEvent[]): string[] {
  const lines: string[] = [];
  const toolCounts = new Map<string, number>();
  let productsFound = 0;
  let compared = 0;
  let cartQty = 0;
  let memoryCount = 0;
  let watchSet = false;
  let handoff = false;
  let changeStaged = false;

  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === "tool_call") {
      toolCounts.set(ev.tool, (toolCounts.get(ev.tool) ?? 0) + 1);
    } else if (ev.type === "ui") {
      if (ev.component === "present_products") {
        productsFound += ev.payload.items?.length ?? 0;
      } else if (ev.component === "present_comparison") {
        compared += ev.payload.entries?.length ?? 0;
      } else if (ev.component === "watch_confirmed") {
        watchSet = true;
      }
    } else if (ev.type === "cart_update") {
      cartQty = (ev.cart.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
    } else if (ev.type === "memory") {
      memoryCount += ev.facts.length;
    } else if (ev.type === "handoff") {
      handoff = true;
    } else if (ev.type === "change_update") {
      changeStaged = true;
    }
  }

  if (productsFound > 0) {
    lines.push(`Đã tìm ${productsFound} chiếc phù hợp`);
  } else {
    const n = toolCounts.get("search_products") ?? 0;
    if (n > 0) lines.push(n === 1 ? "Đã tìm kiếm sản phẩm" : `Đã tìm kiếm ${n} lần`);
  }
  const details = toolCounts.get("get_product_details") ?? 0;
  if (details > 0) {
    lines.push(details === 1 ? "Đã xem chi tiết 1 chiếc" : `Đã xem chi tiết ${details} chiếc`);
  }
  if (compared > 0) {
    lines.push(`Đã so sánh ${compared} chiếc`);
  }
  if (cartQty > 0) {
    lines.push(`Đã thêm ${cartQty} món vào giỏ`);
  } else {
    const n = toolCounts.get("add_to_cart") ?? 0;
    if (n > 0) lines.push("Đã cập nhật giỏ hàng");
  }
  if (watchSet || (toolCounts.get("set_watch") ?? 0) > 0) {
    lines.push("Đã đặt theo dõi (sẽ báo khi khớp điều kiện)");
  }
  const policyHits = toolCounts.get("search_policies") ?? 0;
  if (policyHits > 0) lines.push("Đã tra cứu chính sách");
  const orderHits =
    (toolCounts.get("get_orders") ?? 0) + (toolCounts.get("get_order_status") ?? 0);
  if (orderHits > 0) lines.push("Đã tra cứu đơn hàng");
  if (memoryCount > 0) {
    lines.push(memoryCount === 1 ? "Đã nhớ 1 điều về bạn" : `Đã nhớ ${memoryCount} điều về bạn`);
  }
  if (handoff) lines.push("Đã chuyển vụ việc cho vận hành");
  if (changeStaged) lines.push("Đã đề xuất thay đổi (chờ người duyệt)");

  // Các tool còn lại chưa có dòng riêng → gộp 1 dòng, tránh im lặng khó hiểu.
  const covered = new Set([
    "search_products",
    "get_product_details",
    "add_to_cart",
    "set_watch",
    "search_policies",
    "get_orders",
    "get_order_status",
  ]);
  const others: string[] = [];
  for (const [tool, n] of toolCounts) {
    if (!covered.has(tool)) others.push(n === 1 ? toolLabel(tool) : `${toolLabel(tool)} (${n})`);
  }
  if (others.length > 0) lines.push(`Đã thực hiện: ${others.join(" · ")}`);

  return lines.slice(0, 7);
}
