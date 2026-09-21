import { expect, test } from "@playwright/test";

/**
 * Visual regression cho generative UI của agent (/widget-gallery).
 *
 * Vì sao gallery riêng thay vì /agent thật: nội dung /agent đổi theo model
 * (không deterministic) — gallery render cùng fixture nên cùng 1 ảnh.
 * Ngưỡng maxDiffPixels thấp (vỡ layout là biết) nhưng cho phép lệch font
 * render giữa máy (200px ~ 0.05% ảnh 1440p).
 *
 * Baseline: chạy lần đầu `npx playwright test e2e/visual.spec.ts --update-snapshots`
 * trên cùng 1 máy CI (ubuntu-latest), commit ảnh vào e2e/__snapshots__/.
 * Đổi UI cố ý → update snapshot + review diff trong PR.
 */

const SECTIONS = [
  "present_products",
  "present_comparison",
  "comparison_table",
  "present_plan",
  "present_metrics",
  "present_change_preview",
  "staged_change_card",
  "watch_confirmed",
  "task_saved",
  "task_completed",
  "memory_chip",
];

test.beforeEach(async ({ page }) => {
  // Font + ảnh ổn định trước khi chụp: không chụp giữa lúc font swap.
  await page.goto("/widget-gallery", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts?.ready);
});

for (const section of SECTIONS) {
  test(`visual ${section}`, async ({ page }) => {
    const el = page.getByTestId(`widget-${section}`);
    await expect(el).toBeVisible();
    await expect(el).toHaveScreenshot(`${section}.png`, {
      maxDiffPixels: 200,
      animations: "disabled",
    });
  });
}
