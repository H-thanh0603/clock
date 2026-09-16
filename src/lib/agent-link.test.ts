import { describe, expect, it } from "vitest";
import {
  buildAgentLink,
  cartQuestion,
  compareQuestion,
  detailQuestion,
  watchQuestion,
} from "./agent-link";

describe("buildAgentLink", () => {
  it("encode UTF-8 + product context", () => {
    const url = buildAgentLink({ q: "So sánh Chronos & Meridian?", product: "chronos-x" });
    expect(url.startsWith("/agent?")).toBe(true);
    const params = new URLSearchParams(url.slice("/agent?".length));
    expect(params.get("q")).toBe("So sánh Chronos & Meridian?");
    expect(params.get("product")).toBe("chronos-x");
  });

  it("không product thì không có param product", () => {
    const params = new URLSearchParams(
      buildAgentLink({ q: "hi" }).slice("/agent?".length)
    );
    expect(params.get("q")).toBe("hi");
    expect(params.has("product")).toBe(false);
  });
});

describe("câu hỏi preset", () => {
  it("so sánh nhắc tầm giá + gợi ý", () => {
    const q = compareQuestion("Chronos");
    expect(q).toContain("Chronos");
    expect(q).toMatch(/cùng tầm giá|gợi ý/i);
  });

  it("watch nhắc tên + ngưỡng %", () => {
    expect(watchQuestion("Chronos")).toContain("10%");
    expect(watchQuestion("Chronos", 15)).toContain("15%");
  });

  it("cart + detail không rỗng", () => {
    expect(cartQuestion().length).toBeGreaterThan(10);
    expect(detailQuestion("X")).toContain("X");
  });
});
