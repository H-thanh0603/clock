/**
 * Trang showcase widget chat — render MỌI generative UI của agent với dữ
 * liệu mẫu cố định (không cần agent host, không tốn token).
 *
 * Vì sao cần: visual regression (Playwright screenshot) phải deterministic —
 * chụp /agent thật thì nội dung đổi theo model. Trang này là "storybook nội
 * bộ": cùng 1 fixture → cùng 1 ảnh, vỡ layout là biết ngay.
 *
 * Chỉ dùng dev/test: robots chặn index, layout bỏ qua cũng được (trang lẻ).
 */
import {
  ComparisonTable,
  MemoryChip,
  StagedChangeCard,
  TaskCompleted,
  TaskSaved,
  UxEvent,
  Card,
} from "../agent/chat-widgets";

export const dynamic = "force-static";

const PRODUCT_A = {
  slug: "chronos-tourbillon-no-07",
  name: "Chronos Tourbillon No. 07",
  collection: "Chronos",
  price: 18500,
  priceUsd: 18500,
  image_url: "/images/chronos-07.webp",
  short_description: "Tourbillon một phút, guilloché tay",
  specs: [
    { label: "Calibre", value: "AC-88" },
    { label: "Trữ cót", value: "90 giờ" },
  ],
};

const PRODUCT_B = {
  slug: "royal-chronograph-flyback",
  name: "Royal Chronograph Flyback",
  collection: "Royal",
  price: 24500,
  priceUsd: 24500,
  image_url: "/images/royal-chronograph-flyback.webp",
  short_description: "Chronograph flyback, vành ceramic đen",
  specs: [
    { label: "Calibre", value: "AC-91" },
    { label: "Trữ cót", value: "60 giờ" },
  ],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-space-2xl" data-testid={`widget-${title}`}>
      <h2 className="font-label-spec text-label-spec mb-space-md tracking-[0.2em] text-secondary uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function WidgetGalleryPage() {
  return (
    <div className="mx-auto max-w-page px-6 py-14 md:px-8">
      <h1 className="font-display mb-space-2xl text-3xl">Widget gallery (visual test)</h1>

      <Section title="present_products">
        <UxEvent
          event={{
            type: "ui",
            component: "present_products",
            payload: {
              title: "Gợi ý tourbillon",
              items: [
                { product: PRODUCT_A, reason: "Đúng màu đen bạn hỏi" },
                { product: PRODUCT_B, reason: "Thêm lựa chọn cùng tầm giá" },
              ],
            },
          }}
        />
      </Section>

      <Section title="present_comparison">
        <UxEvent
          event={{
            type: "ui",
            component: "present_comparison",
            payload: {
              title: "So sánh 2 chiếc",
              entries: [{ product: PRODUCT_A }, { product: PRODUCT_B }],
              dimensions: ["Calibre", "Trữ cót"],
              recommended_product_id: PRODUCT_A.slug,
            },
          }}
        />
      </Section>

      <Section title="comparison_table">
        <Card>
          <ComparisonTable
            entries={[{ product: PRODUCT_A }, { product: PRODUCT_B }]}
            dimensions={["Calibre", "Trữ cót"]}
            recommendedId={PRODUCT_A.slug}
          />
        </Card>
      </Section>

      <Section title="present_plan">
        <UxEvent
          event={{
            type: "ui",
            component: "present_plan",
            payload: { title: "Kế hoạch mua", steps: ["Chọn mẫu", "Đặt cọc 20%", "Bàn giao"] },
          }}
        />
      </Section>

      <Section title="present_metrics">
        <UxEvent
          event={{
            type: "ui",
            component: "present_metrics",
            payload: {
              title: "Doanh số 7 ngày",
              picks: [
                { label: "Doanh thu", value: "$1.2M", change_pct: 8.5 },
                { label: "Đơn", value: "34", change_pct: -2.0 },
              ],
            },
          }}
        />
      </Section>

      <Section title="present_change_preview">
        <UxEvent
          event={{
            type: "ui",
            component: "present_change_preview",
            payload: {
              headline: "Giảm giá Chronos 10%",
              note: "Từ $18,500 xuống $16,650",
            },
          }}
        />
      </Section>

      <Section title="staged_change_card">
        <StagedChangeCard
          change={{
            change_id: "chg-0001",
            kind: "price",
            status: "staged",
            summary: "Giảm giá Chronos Tourbillon 10%",
            items: [
              { target: "chronos-tourbillon-no-07", field: "price", before: 18500, after: 16650 },
            ],
          }}
        />
      </Section>

      <Section title="watch_confirmed">
        <UxEvent
          event={{
            type: "ui",
            component: "watch_confirmed",
            payload: {
              product_id: PRODUCT_A.slug,
              confirmed: "giá giảm ít nhất 10% so với $18,500",
            },
          }}
        />
      </Section>

      <Section title="task_saved">
        <TaskSaved title="So 3 chiếc tourbillon" goal="Ngân sách dưới $50k" taskId="task-1" />
      </Section>

      <Section title="task_completed">
        <TaskCompleted taskId="task-1" />
      </Section>

      <Section title="memory_chip">
        <MemoryChip facts={["thích mặt 40mm", "ưu tiên dây da"]} />
      </Section>
    </div>
  );
}
