/**
 * Generative UI + presentational widgets của trang /agent (tách từ page.tsx,
 * P2-3). File thuần hiển thị — không chứa state chat, không gọi API.
 * Logic stream/state nằm ở useAgentChat.tsx.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import {
  agentPrice,
  type AgentEvent,
  type AgentProduct,
  type StagedChangeSnapshot,
  type UxPayload,
} from "@/lib/agent-events";
import { mediaUrl } from "@/lib/media";

// ---------------------------------------------------------------------------
// UI helpers theo design system Obsidian & Champagne (globals.css tokens)
// ---------------------------------------------------------------------------

export function fmtUsd(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-outline-variant/25 bg-surface-container/50 p-space-lg ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generative components — render payload của từng "ui" event
// ---------------------------------------------------------------------------

function ProductPick({ product, reason }: { product: AgentProduct; reason?: string | null }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block border border-outline-variant/25 bg-surface-lowest/60 transition-colors duration-300 hover:border-primary-container/60"
    >
      <div className="relative aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(product.images?.[0] ?? product.image_url ?? "/images/logo.png")}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-space-md">
        <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant">
          {product.collection}
        </p>
        <h3 className="font-headline-md text-headline-md text-on-surface mt-1">{product.name}</h3>
        <p className="font-body-sm text-body-sm text-primary mt-2">{fmtUsd(agentPrice(product))}</p>
        {reason && <p className="font-body-sm text-body-sm text-on-surface-variant/70 mt-2">{reason}</p>}
      </div>
    </Link>
  );
}

function ProductsGrid({ payload }: { payload: UxPayload }) {
  if (!payload.items?.length) return null;
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface mb-space-md">{payload.title}</h3>
      )}
      <div className={`grid gap-space-md ${payload.items.length > 2 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
        {payload.items.map((it) => (
          <ProductPick key={it.product.slug} product={it.product} reason={it.reason} />
        ))}
      </div>
    </Card>
  );
}

function ComparisonGrid({ payload }: { payload: UxPayload }) {
  if (!payload.entries?.length) return null;
  const dims = payload.dimensions ?? [];
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface mb-space-md">{payload.title}</h3>
      )}
      <div className="overflow-x-auto">
        <table className="w-full font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-outline-variant/30 text-left text-on-surface-variant">
              <th className="py-space-sm pr-space-md font-label-spec text-label-spec uppercase tracking-wider">Tiêu chí</th>
              {payload.entries.map((e) => (
                <th
                  key={e.product.slug}
                  className={`py-space-sm px-space-md font-label-spec text-label-spec uppercase tracking-wider ${
                    payload.recommended_product_id === e.product.slug ? "text-primary" : ""
                  }`}
                >
                  {e.product.name}
                  {payload.recommended_product_id === e.product.slug && (
                    <span className="ml-1 text-primary">★</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dims.map((d, i) => (
              <tr key={i} className="border-b border-outline-variant/15">
                <td className="py-space-sm pr-space-md text-on-surface-variant">{d}</td>
                {payload.entries?.map((e) => (
                  <td key={e.product.slug} className="py-space-sm px-space-md text-on-surface">
                    {e.product.specs?.find((s) => s.label === d)?.value ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-space-sm pr-space-md text-on-surface-variant">Giá</td>
              {payload.entries.map((e) => (
                <td key={e.product.slug} className="py-space-sm px-space-md text-primary">
                  {fmtUsd(agentPrice(e.product))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlanChecklist({ payload }: { payload: UxPayload }) {
  if (!payload.steps?.length) return null;
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface">{payload.title}</h3>
      )}
      {payload.intro && (
        <p className="font-body-md text-body-md text-on-surface-variant mt-space-sm mb-space-md">{payload.intro}</p>
      )}
      <ol className="space-y-space-sm">
        {payload.steps.map((s, i) => (
          <li key={i} className="flex gap-space-sm font-body-md text-body-md text-on-surface">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/50 font-label-badge text-label-badge text-primary">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MetricsTiles({ payload }: { payload: UxPayload }) {
  if (!payload.picks?.length) return null;
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{payload.title}</h3>
      )}
      {payload.period && (
        <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-md">
          {payload.period}
        </p>
      )}
      <div className="grid grid-cols-2 gap-space-md md:grid-cols-4">
        {payload.picks.map((m, i) => (
          <div key={i} className="border border-outline-variant/25 bg-surface-lowest/60 p-space-md">
            <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant">{m.label}</p>
            <p className="font-headline-lg text-headline-lg text-primary mt-1">
              {m.value}
              {m.unit && <span className="font-body-sm text-body-sm text-on-surface-variant ml-1">{m.unit}</span>}
            </p>
            {typeof m.change_pct === "number" && (
              <p className={`font-body-sm text-body-sm mt-1 ${m.change_pct >= 0 ? "text-primary" : "text-error"}`}>
                {m.change_pct >= 0 ? "▲" : "▼"} {Math.abs(m.change_pct).toFixed(1)}%
              </p>
            )}
            {m.note && <p className="font-body-sm text-body-sm text-on-surface-variant/70 mt-1">{m.note}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StagedChangeCard({ change }: { change: StagedChangeSnapshot }) {
  return (
    <Card className="border-primary/40">
      <div className="flex items-start justify-between gap-space-md">
        <div>
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
            Đề xuất thay đổi · {change.kind}
          </p>
          <p className="font-headline-md text-headline-md text-on-surface mt-1">{change.summary}</p>
        </div>
        <span
          className={`shrink-0 px-2 py-1 font-label-badge text-label-badge uppercase tracking-wider ${
            change.status === "applied"
              ? "bg-primary text-surface-lowest"
              : change.status === "discarded"
                ? "bg-surface-container-high text-on-surface-variant"
                : "border border-primary/50 text-primary"
          }`}
        >
          {change.status === "staged" ? "chờ duyệt" : change.status}
        </span>
      </div>
      {change.items && change.items.length > 0 && (
        <ul className="mt-space-md space-y-1 border-t border-outline-variant/20 pt-space-md font-body-sm text-body-sm">
          {change.items.map((it, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="text-on-surface-variant">{it.target}</span>
              <span className="text-primary">{it.field}:</span>
              <span className="text-on-surface-variant/60 line-through">{String(it.before)}</span>
              <span className="text-on-surface">→</span>
              <span className="text-primary">{String(it.after)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant/70">
        Thay đổi chỉ áp dụng khi operator duyệt qua agent host (approve → apply).
      </p>
    </Card>
  );
}
export function UxEvent({ event }: { event: Extract<AgentEvent, { type: "ui" }> }) {
  switch (event.component) {
    case "present_products":
      return <ProductsGrid payload={event.payload} />;
    case "present_comparison":
      return <ComparisonGrid payload={event.payload} />;
    case "present_plan":
    case "present_guide":
    case "present_digest":
      return <PlanChecklist payload={event.payload} />;
    case "present_metrics":
      return <MetricsTiles payload={event.payload} />;
    case "present_change_preview":
      return (
        <Card className="border-primary/40">
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">Đề xuất</p>
          <p className="font-headline-md text-headline-md text-on-surface mt-1">{event.payload.headline}</p>
          {event.payload.note && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">{event.payload.note}</p>
          )}
        </Card>
      );
    case "present_order_status":
      return (
        <Card>
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant">
            Đơn {event.payload.order_id}
          </p>
          <p className="font-body-md text-body-md text-on-surface mt-1">{event.payload.summary}</p>
          {event.payload.next_step && (
            <p className="font-body-sm text-body-sm text-primary mt-2">→ {event.payload.next_step}</p>
          )}
        </Card>
      );
    case "watch_confirmed":
      return (
        <Card className="border-primary/40">
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
            Đã đặt theo dõi
          </p>
          <p className="font-body-md text-body-md text-on-surface mt-1">
            {event.payload.product_id} — sẽ báo khi {event.payload.confirmed ?? "điều kiện khớp"}.
          </p>
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant/70">
            Agent kiểm tra nền mỗi vài phút — bạn không cần ở lại đây.
          </p>
        </Card>
      );
    default:
      return null; // host bỏ qua component không biết — đúng hợp đồng upstream
  }
}
