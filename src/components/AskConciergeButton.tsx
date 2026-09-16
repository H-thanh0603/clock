"use client";

import { buildAgentLink, detailQuestion } from "@/lib/agent-link";

/**
 * Nút deep-link vào agent với câu hỏi preset theo ngữ cảnh (G1-3) —
 * dệt agent vào site (agentic web): agent nhận đúng context trang đang xem
 * qua query param. Trang /agent đọc ?q= + ?product= → tự gửi câu hỏi đầu tiên.
 */
export default function AskConciergeButton({
  slug,
  name,
  question,
  label = "✦ Hỏi AI Concierge về chiếc này",
}: {
  slug?: string;
  name?: string;
  /** Câu hỏi preset; mặc định = hỏi chung về chiếc đang xem. */
  question?: string;
  /** Nhãn nút. */
  label?: string;
}) {
  const q = question ?? detailQuestion(name ?? "chiếc đồng hồ này");
  return (
    <a
      href={buildAgentLink({ q, product: slug })}
      className="inline-flex items-center gap-2 border border-primary/40 px-4 py-2 font-label-spec text-label-spec uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-surface-lowest"
    >
      {label}
    </a>
  );
}
