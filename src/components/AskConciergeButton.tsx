"use client";

/**
 * Nút "Hỏi concierge" trên trang chi tiết sản phẩm — dệt agent vào site
 * (agentic web): agent nhận đúng context trang đang xem qua query param.
 * Trang /agent đọc ?q= + ?product= → tự gửi câu hỏi đầu tiên.
 */
export default function AskConciergeButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const params = new URLSearchParams({
    q: `Tôi đang xem ${name} — chiếc này phù hợp với tôi không? Có chiếc nào tương tự để so sánh?`,
    product: slug,
  });
  return (
    <a
      href={`/agent?${params.toString()}`}
      className="inline-flex items-center gap-2 border border-primary/40 px-4 py-2 font-label-spec text-label-spec uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-surface-lowest"
    >
      ✦ Hỏi AI Concierge về chiếc này
    </a>
  );
}
