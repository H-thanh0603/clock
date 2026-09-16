import { describe, expect, it } from "vitest";
import {
  agentPrice,
  applyEvent,
  buildReceipt,
  emptyAccumulator,
  memoryFactText,
  parseAgentEvent,
  parseSseBody,
} from "@/lib/agent-events";

describe("parseAgentEvent", () => {
  it("parse event chuẩn từ agent host", () => {
    const ev = parseAgentEvent('{"type":"text_delta","text":"Xin chào"}');
    expect(ev).toEqual({ type: "text_delta", text: "Xin chào" });
  });

  it("bỏ qua JSON rác / không phải object / thiếu type", () => {
    expect(parseAgentEvent("not json")).toBeNull();
    expect(parseAgentEvent("[1,2]")).toBeNull();
    expect(parseAgentEvent('{"no_type":1}')).toBeNull();
    expect(parseAgentEvent("")).toBeNull();
  });
});

describe("parseSseBody", () => {
  it("đọc nhiều khối data: theo chuẩn SSE", () => {
    const body = [
      'data: {"type":"session","session_id":"s1"}',
      "",
      'data: {"type":"text_delta","text":"A"}',
      "",
      'data: {"type":"text_delta","text":"B"}',
      "",
      "",
    ].join("\n");
    const evs = parseSseBody(body);
    expect(evs).toHaveLength(3);
    expect(evs[0].type).toBe("session");
    if (evs[0].type === "session") expect(evs[0].session_id).toBe("s1");
    expect(evs.filter((e) => e.type === "text_delta").map((e) => (e as { text: string }).text)).toEqual([
      "A",
      "B",
    ]);
  });

  it("chấp nhận cả 'data:' không space", () => {
    expect(parseSseBody('data:{"type":"done"}')).toHaveLength(1);
  });
});

describe("applyEvent — vòng đời 1 turn", () => {
  it("ghép text dần, giữ session, xả status khi có tool_result", () => {
    let acc = emptyAccumulator();
    acc = applyEvent(acc, parseAgentEvent('{"type":"session","session_id":"s9"}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"text_delta","text":"Tôi là"}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"text_delta","text":" Concierge"}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"tool_call","tool":"search_products","id":"t1","label":"đang tìm…"}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"tool_result","tool":"search_products","id":"t1","summary":"3 sp","is_error":false}')!);

    expect(acc.session_id).toBe("s9");
    expect(acc.text).toBe("Tôi là Concierge");
    expect(acc.status).toBeNull(); // tool_result xả status
  });

  it("ui event stack đúng thứ tự; cart + change cập nhật đè", () => {
    let acc = emptyAccumulator();
    acc = applyEvent(acc, parseAgentEvent('{"type":"ui","component":"present_products","payload":{"title":"Gợi ý","items":[]}}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"ui","component":"present_plan","payload":{"title":"Kế hoạch","steps":["B1"]}}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"cart_update","cart":{"items":[{"product_id":"p","title":"A","quantity":1,"price":100}]}}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"change_update","change":{"change_id":"c1","kind":"price_update","status":"staged","summary":"Giá +1000"}}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"memory","facts":[{"fact":"thích mặt 40mm"}]}')!);
    acc = applyEvent(acc, parseAgentEvent('{"type":"done"}')!);

    expect(acc.ui.map((u) => u.component)).toEqual(["present_products", "present_plan"]);
    expect(acc.cart?.items?.[0].price).toBe(100);
    expect(acc.change?.status).toBe("staged");
    expect(acc.memoryFacts).toEqual(["thích mặt 40mm"]);
    expect(acc.done).toBe(true);
  });

  it("error event không dừng accumulator, chỉ ghi lại", () => {
    let acc = emptyAccumulator();
    acc = applyEvent(acc, parseAgentEvent('{"type":"error","message":"503"}')!);
    expect(acc.done).toBe(false);
    expect(acc.errors).toEqual(["503"]);
  });

  it("handoff event (shopping → merchant) ghi ticket", () => {
    let acc = emptyAccumulator();
    acc = applyEvent(
      acc,
      parseAgentEvent('{"type":"handoff","ticket_id":"t-123-0001","message":"Đã ghi nhận"}')!,
    );
    expect(acc.handoff).toEqual({ ticket_id: "t-123-0001", message: "Đã ghi nhận" });
  });

  it("ui watch_confirmed stack như component thường", () => {
    let acc = emptyAccumulator();
    acc = applyEvent(
      acc,
      parseAgentEvent(
        '{"type":"ui","component":"watch_confirmed","payload":{"product_id":"chrono-x","watch_id":"w-1","confirmed":"sản phẩm về lại hàng"}}',
      )!,
    );
    expect(acc.ui[0].component).toBe("watch_confirmed");
    expect(acc.ui[0].payload.watch_id).toBe("w-1");
  });
});

describe("agentPrice", () => {
  it("ưu tiên priceUsd, fallback price (USD là source-of-truth)", () => {
    expect(agentPrice({ slug: "a", name: "A", priceUsd: 100, price: 200 })).toBe(100);
    expect(agentPrice({ slug: "b", name: "B", price: 200 })).toBe(200);
    expect(agentPrice({ slug: "c", name: "C" })).toBe(0);
  });
});

describe("buildReceipt — biên lai cuối turn", () => {
  it("turn tìm + so + giỏ + nhớ → dòng giàu thông tin, đúng thứ tự", () => {
    const evs = [
      { type: "tool_call", tool: "search_products", id: "t1" },
      { type: "tool_call", tool: "search_products", id: "t2" },
      {
        type: "ui",
        component: "present_products",
        payload: { items: [{ product: { slug: "a" } }, { product: { slug: "b" } }] },
      },
      { type: "tool_call", tool: "get_product_details", id: "t3" },
      {
        type: "ui",
        component: "present_comparison",
        payload: { entries: [{ product: { slug: "a" } }, { product: { slug: "b" } }] },
      },
      { type: "cart_update", cart: { items: [{ quantity: 1 }, { quantity: 2 }] } },
      { type: "memory", facts: [{ fact: "thích 40mm" }, { fact: "vàng hồng" }] },
      { type: "done" },
    ];
    expect(buildReceipt(evs as never)).toEqual([
      "Đã tìm 2 chiếc phù hợp",
      "Đã xem chi tiết 1 chiếc",
      "Đã so sánh 2 chiếc",
      "Đã thêm 3 món vào giỏ",
      "Đã nhớ 2 điều về bạn",
    ]);
  });

  it("turn tán gẫu thuần → mảng rỗng (không render gì)", () => {
    expect(
      buildReceipt([{ type: "text_delta", text: "chào" }, { type: "done" }] as never)
    ).toEqual([]);
  });

  it("watch + handoff + policy + order lookup → đủ dòng", () => {
    const evs = [
      { type: "tool_call", tool: "set_watch", id: "t1" },
      { type: "tool_call", tool: "search_policies", id: "t2" },
      { type: "tool_call", tool: "get_orders", id: "t3" },
      { type: "handoff", ticket_id: "t-1", message: "ok" },
      { type: "done" },
    ];
    expect(buildReceipt(evs as never)).toEqual([
      "Đã đặt theo dõi (sẽ báo khi khớp điều kiện)",
      "Đã tra cứu chính sách",
      "Đã tra cứu đơn hàng",
      "Đã chuyển vụ việc cho vận hành",
    ]);
  });

  it("tool lạ không im lặng — gộp vào dòng 'Đã thực hiện'", () => {
    const evs = [
      { type: "tool_call", tool: "get_cart", id: "t1" },
      { type: "done" },
    ];
    expect(buildReceipt(evs as never)).toEqual(["Đã thực hiện: Kiểm tra giỏ hàng"]);
  });
});

describe("memoryFactText — chuẩn hóa 2 shape fact", () => {
  it("shape vendor {key, value} → 'key: value'", () => {
    expect(memoryFactText({ key: "size", value: "40mm" })).toBe("size: 40mm");
    expect(memoryFactText({ value: "vàng hồng" })).toBe("vàng hồng");
  });

  it("shape cũ {fact} vẫn đọc được", () => {
    expect(memoryFactText({ fact: "thích tourbillon" })).toBe("thích tourbillon");
  });

  it("rác → chuỗi rỗng (caller lọc bỏ)", () => {
    expect(memoryFactText({})).toBe("");
    expect(memoryFactText({ key: "x" })).toBe("");
    expect(memoryFactText({ fact: "   " })).toBe("");
  });
});
