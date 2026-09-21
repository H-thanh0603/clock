"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/api-client";

/** Hành động trên 1 hóa đơn chưa phát hành: đánh dấu tay / thử lại NCC. */
export function InvoiceActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [number, setNumber] = useState("");

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await csrfFetch(path, {
        method: body === undefined ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      if (!res.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : (data?.message ?? `Lỗi ${res.status}`);
        throw new Error(msg);
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setBusy(false);
    }
  }

  // ISSUED tay bắt buộc có số hóa đơn — chống đánh dấu ẩu không đối chiếu được.
  const markIssued = () =>
    call(`/admin/invoices/${id}`, { status: "ISSUED", number: number.trim() });
  const markFailed = () =>
    call(`/admin/invoices/${id}`, {
      status: "FAILED",
      externalRef: "NCC từ chối (nhập tay)",
    });

  return (
    <div className="mt-space-md flex flex-wrap items-center gap-space-sm border-t border-outline-variant/20 pt-space-md">
      <input
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Số hóa đơn AUR-... (bắt buộc khi đánh dấu)"
        className="min-w-64 flex-1 rounded bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        onClick={markIssued}
        disabled={busy || !number.trim()}
        className="rounded bg-primary px-4 py-2 font-label-spec text-label-spec uppercase tracking-[0.15em] text-on-primary disabled:opacity-50"
      >
        {busy ? "…" : "Đã phát hành"}
      </button>
      <button
        onClick={markFailed}
        disabled={busy}
        className="rounded bg-surface-container px-4 py-2 font-label-spec text-label-spec uppercase tracking-[0.15em] text-error disabled:opacity-50"
      >
        NCC từ chối
      </button>
      {status === "FAILED" && (
        <button
          onClick={() => call(`/admin/invoices/${id}/retry`)}
          disabled={busy}
          className="rounded bg-surface-container px-4 py-2 font-label-spec text-label-spec uppercase tracking-[0.15em] text-on-surface-variant disabled:opacity-50"
        >
          Thử lại NCC
        </button>
      )}
      {error && (
        <span className="w-full font-body-sm text-body-sm text-error">{error}</span>
      )}
    </div>
  );
}
