import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * A11y (axe-core): quét trang public chính — không lỗi serious/critical.
 *
 * Vì sao chỉ serious/critical (không quét hết): site luxury dùng nhiều pattern
 * trang trí (contrast chữ mờ trên nền tối, heading visual) mà axe gắn cờ
 * moderate/minor — fix hết thì mất thẩm mỹ, để backlog đợt polish riêng.
 * serious/critical (thiếu alt, label form, tương phản fail nặng, landmark)
 * thì chặn merge.
 *
 * Chạy cùng job e2e (cần FE dev ở :3100): npx playwright test e2e/a11y.spec.ts
 */

const FE = process.env.FE_URL ?? "http://localhost:3100";

const PAGES = ["/", "/collections", "/cart", "/checkout", "/login", "/agent"];

for (const path of PAGES) {
  test(`a11y ${path} — không lỗi serious/critical`, async ({ page }) => {
    await page.goto(`${FE}${path}`, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const blocking = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(
      blocking.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
      `axe serious/critical ở ${path}`
    ).toEqual([]);
  });
}
