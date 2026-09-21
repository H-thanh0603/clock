/**
 * Deep-link vào trang /agent với câu hỏi + context sản phẩm preset (G1-3).
 * Quick-action theo ngữ cảnh: thay vì để khách tự nghĩ câu hỏi, mỗi nơi
 * (detail, giỏ) gợi đúng việc agent làm giỏi nhất ở đó — bấm 1 cái là thấy
 * agent LÀM VIỆC chứ không phải trả lời chung chung.
 */

/** Dựng URL /agent?q=...&product=... (tách thuần để test được). */
export function buildAgentLink(opts: { q: string; product?: string }): string {
  const params = new URLSearchParams({ q: opts.q });
  if (opts.product) params.set("product", opts.product);
  return `/agent?${params.toString()}`;
}

/** Câu hỏi preset theo ngữ cảnh (tiếng Việt, khớp capability agent). */
export function compareQuestion(name: string): string {
  return (
    `So sánh ${name} với 2 chiếc khác cùng tầm giá — ` +
    `lập bảng ưu/nhược và gợi ý chiếc hợp nhất cho tôi.`
  );
}

export function watchQuestion(name: string, pct = 10): string {
  return `Báo tôi khi chiếc ${name} giảm giá ít nhất ${pct}%.`;
}

export function cartQuestion(): string {
  return (
    "Xem giúp giỏ hàng của tôi còn thiếu gì để đặt hàng " +
    "(thông tin, phương thức thanh toán) và tư vấn bước tiếp theo."
  );
}

export function detailQuestion(name: string): string {
  return `Tôi đang xem ${name} — chiếc này phù hợp với tôi không? Có chiếc nào tương tự để so sánh?`;
}

/** Bản EN của câu hỏi preset (locale=en) — agent đọc được cả 2 thứ tiếng. */
export function compareQuestionEn(name: string): string {
  return (
    `Compare ${name} with 2 peers in the same price range — ` +
    `build a pros/cons table and recommend the best fit for me.`
  );
}

export function watchQuestionEn(name: string, pct = 10): string {
  return `Notify me when ${name} drops at least ${pct}%.`;
}

export function cartQuestionEn(): string {
  return (
    "Review my cart for anything missing to place the order " +
    "(details, payment method) and advise the next step."
  );
}

export function detailQuestionEn(name: string): string {
  return `I'm looking at ${name} — is it right for me? Any similar pieces to compare?`;
}
