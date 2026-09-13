import { describe, expect, it } from "vitest";
import {
  agentPrice,
  applyEvent,
  emptyAccumulator,
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
