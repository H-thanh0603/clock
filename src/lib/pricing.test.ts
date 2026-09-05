import { describe, expect, it } from "vitest";
import { linePrice, USD_TO_VND } from "@/lib/pricing";
import { products, strapOptions } from "@/data/products";

describe("linePrice", () => {
  it("VND luôn suy ra từ USD × USD_TO_VND", () => {
    const { priceUsd, priceVnd } = linePrice(145000);
    expect(priceUsd).toBe(145000);
    expect(priceVnd).toBe(145000 * USD_TO_VND);
  });

  it("cộng đúng delta strap đã chọn", () => {
    const metal = strapOptions.find((s) => s.priceDeltaUsd > 0)!;
    const { priceUsd, priceVnd } = linePrice(1000, metal.label);
    expect(priceUsd).toBe(1000 + metal.priceDeltaUsd);
    expect(priceVnd).toBe((1000 + metal.priceDeltaUsd) * USD_TO_VND);
  });

  it("strap lạ/không tồn tại → delta 0 (không crash)", () => {
    const { priceUsd } = linePrice(1000, "Dây da khủng long");
    expect(priceUsd).toBe(1000);
  });

  it("số lẻ/âm được làm tròn an toàn", () => {
    expect(linePrice(99.9).priceUsd).toBe(99);
    expect(linePrice(-5).priceUsd).toBe(0);
  });
});

describe("catalog pricing invariant", () => {
  it("mọi sản phẩm đều priceVnd = priceUsd × USD_TO_VND", () => {
    for (const p of products) {
      expect(p.priceVnd, `${p.slug} lệch giá VND`).toBe(
        p.priceUsd * USD_TO_VND
      );
    }
  });

  it("strap label duy nhất (không trùng key tra delta)", () => {
    const labels = strapOptions.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
