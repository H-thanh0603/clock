import { describe, expect, it } from "vitest";
import {
  agentUpstreamUrl,
  isOpsPathAllowed,
  normalizeSubPath,
  resolveAgentUpstreamHost,
} from "./agent-proxy";

describe("normalizeSubPath", () => {
  it("join segments thường", () => {
    expect(normalizeSubPath(["merchant", "chat"])).toBe("merchant/chat");
  });
  it("chặn traversal và segment rỗng", () => {
    expect(normalizeSubPath([".."])).toBeNull();
    expect(normalizeSubPath(["alerts", "..", "x"])).toBeNull();
    expect(normalizeSubPath(["."])).toBeNull();
    expect(normalizeSubPath([""])).toBeNull();
    expect(normalizeSubPath([])).toBeNull();
    expect(normalizeSubPath(undefined)).toBeNull();
  });
});

describe("isOpsPathAllowed", () => {
  it("cho phép đúng endpoint + method", () => {
    expect(isOpsPathAllowed("merchant/chat", "POST")).toBe(true);
    expect(isOpsPathAllowed("merchant/changes", "GET")).toBe(true);
    expect(
      isOpsPathAllowed("merchant/changes/chg-0001/approve", "POST")
    ).toBe(true);
    expect(
      isOpsPathAllowed("merchant/changes/chg-0001/discard", "POST")
    ).toBe(true);
    expect(isOpsPathAllowed("alerts", "GET")).toBe(true);
    expect(isOpsPathAllowed("shop/monitor/run", "POST")).toBe(true);
    expect(isOpsPathAllowed("activity", "GET")).toBe(true);
    expect(isOpsPathAllowed("shop/watches", "GET")).toBe(true);
    expect(isOpsPathAllowed("shop/watches/w-1/cancel", "POST")).toBe(true);
  });
  it("chặn sai method", () => {
    expect(isOpsPathAllowed("merchant/chat", "GET")).toBe(false);
    expect(isOpsPathAllowed("alerts", "POST")).toBe(false);
    expect(isOpsPathAllowed("shop/monitor/run", "GET")).toBe(false);
  });
  it("chặn endpoint shop công khai và path lạ", () => {
    // Shop chat/feed gọi thẳng host từ browser — không đi qua proxy này.
    expect(isOpsPathAllowed("shop/chat", "POST")).toBe(false);
    expect(isOpsPathAllowed("health", "GET")).toBe(false);
    expect(isOpsPathAllowed("merchant", "GET")).toBe(false);
    expect(isOpsPathAllowed("", "GET")).toBe(false);
    expect(isOpsPathAllowed(null, "GET")).toBe(false);
  });
});

describe("resolveAgentUpstreamHost", () => {
  it("ưu tiên AGENT_INTERNAL_URL, bỏ slash thừa", () => {
    expect(
      resolveAgentUpstreamHost({ AGENT_INTERNAL_URL: "http://agent:8100/" })
    ).toBe("http://agent:8100");
  });
  it("KHÔNG fallback public URL — thiếu internal → loopback dev", () => {
    expect(resolveAgentUpstreamHost({})).toBe("http://127.0.0.1:8100");
    expect(resolveAgentUpstreamHost({ AGENT_INTERNAL_URL: "  " })).toBe(
      "http://127.0.0.1:8100"
    );
  });
});

describe("agentUpstreamUrl", () => {  it("giữ query, bỏ slash thừa", () => {
    expect(agentUpstreamUrl("http://agent:8100/", "alerts", "limit=20")).toBe(
      "http://agent:8100/alerts?limit=20"
    );
    expect(agentUpstreamUrl("http://agent:8100", "merchant/chat", "")).toBe(
      "http://agent:8100/merchant/chat"
    );
  });
});
