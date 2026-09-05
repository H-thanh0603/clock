"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, csrfFetch } from "@/lib/api-client";
import type { Product } from "@/data/products";
import { formatUsd } from "@/data/products";

type Draft = {
  slug: string;
  name: string;
  reference: string;
  collection: string;
  priceUsd: string;
  shortDescription: string;
  strapLabel: string;
  cardImage: string;
  calibre: string;
  diameterMm: string;
  stock: string;
  caseMaterial: string;
  narrative: string;
  images: string;
  badges: string;
  complications: string;
  inBoutique: boolean;
};

const EMPTY: Draft = {
  slug: "",
  name: "",
  reference: "",
  collection: "classic",
  priceUsd: "",
  shortDescription: "",
  strapLabel: "",
  cardImage: "",
  calibre: "",
  diameterMm: "",
  stock: "1",
  caseMaterial: "",
  narrative: "",
  images: "",
  badges: "",
  complications: "",
  inBoutique: true,
};

function toDraft(p: Product): Draft {
  return {
    slug: p.slug,
    name: p.name,
    reference: p.reference,
    collection: p.collection,
    priceUsd: String(p.priceUsd),
    shortDescription: p.shortDescription,
    strapLabel: p.strapLabel,
    cardImage: p.cardImage,
    calibre: p.calibre,
    diameterMm: String(p.diameterMm),
    stock: String(p.stock ?? 1),
    caseMaterial: p.caseMaterial,
    narrative: p.narrative,
    images: p.images.join("\n"),
    badges: p.badges.join(", "),
    complications: p.complications.join(", "),
    inBoutique: p.inBoutique,
  };
}

function splitLines(v: string) {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitCommas(v: string) {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProductManager({ products }: { products: Product[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<
    { id: string; action: string; summary: string | null; createdAt: string }[]
  >([]);

  const openNew = () => {
    setEditing({ ...EMPTY });
    setIsNew(true);
    setError("");
  };

  const openEdit = (p: Product) => {
    setEditing(toDraft(p));
    setIsNew(false);
    setError("");
    setHistory([]);
    fetch(apiUrl(`/admin/products/${p.slug}/events`), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((h) => setHistory(Array.isArray(h) ? h : []))
      .catch(() => {});
  };

  const uploadImage = async (file: File, target: "card" | "gallery") => {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      // csrfFetch + FormData: không set Content-Type tay (browser tự boundary).
      const token = document.cookie.match(/(?:^|; )aurel_csrf=([^;]*)/)?.[1];
      const res = await fetch(apiUrl("/admin/uploads"), {
        method: "POST",
        credentials: "include",
        headers: token ? { "x-csrf-token": decodeURIComponent(token) } : {},
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (data && (Array.isArray(data.message) ? data.message.join(", ") : data.message)) ??
            "Upload thất bại"
        );
      const url = data.url as string;
      setEditing((prev) => {
        if (!prev) return prev;
        if (target === "card") return { ...prev, cardImage: url };
        return { ...prev, images: prev.images ? `${prev.images}\n${url}` : url };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload thất bại");
    } finally {
      setUploading(false);
    }
  };

  const toggleBoutique = async (p: Product) => {    try {
      const res = await csrfFetch(`/admin/products/${p.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inBoutique: !p.inBoutique }),
      });
      if (!res.ok) throw new Error("Cập nhật thất bại");
      router.refresh();
    } catch {
      alert("Không đổi được trạng thái hiển thị");
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: editing.name,
        reference: editing.reference,
        collection: editing.collection,
        priceUsd: Number(editing.priceUsd),
        shortDescription: editing.shortDescription,
        strapLabel: editing.strapLabel,
        cardImage: editing.cardImage,
        calibre: editing.calibre,
        diameterMm: Number(editing.diameterMm),
        stock: Math.max(0, Math.floor(Number(editing.stock) || 0)),
        caseMaterial: editing.caseMaterial,
        narrative: editing.narrative,
        images: splitLines(editing.images),
        badges: splitCommas(editing.badges),
        complications: splitCommas(editing.complications),
        inBoutique: editing.inBoutique,
        ...(isNew ? { slug: editing.slug } : {}),
      };
      const res = await csrfFetch(
        isNew ? "/admin/products" : `/admin/products/${editing.slug}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message) ??
            data.error ??
            "Lưu thất bại"
        );
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full bg-surface-container-high px-3 py-2 rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div>
      <div className="mt-space-lg flex items-center justify-between">
        <p className="font-body-md text-body-md text-on-surface-variant">
          {products.length} mẫu • tắt “Boutique” để ẩn khỏi cửa hàng (không xóa
          cứng vì còn ràng buộc đơn hàng)
        </p>
        <button
          onClick={openNew}
          className="rounded bg-primary px-5 py-3 font-label-spec text-label-spec font-semibold tracking-[0.2em] text-on-primary uppercase hover:bg-secondary"
        >
          + Thêm sản phẩm
        </button>
      </div>

      <div className="mt-space-md space-y-space-xs">
        {products.map((p) => (
          <div
            key={p.slug}
            className="flex flex-wrap items-center justify-between gap-space-sm rounded bg-surface-container px-5 py-4"
          >
            <div className="flex items-center gap-4">
              {p.cardImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.cardImage}
                  alt={p.name}
                  className="h-14 w-14 rounded object-cover"
                />
              )}
              <div>
                <p className="font-body-md text-body-md font-semibold text-on-surface">
                  {p.name}{" "}
                  <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">
                    • {p.reference}
                  </span>
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {p.collection} • {formatUsd(p.priceUsd)} •{" "}
                  {p.inBoutique ? "Đang trưng bày" : "Đang ẩn"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleBoutique(p)}
                className="rounded border border-primary-container/50 px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] text-primary uppercase hover:bg-primary hover:text-on-primary"
              >
                {p.inBoutique ? "Ẩn" : "Hiện"}
              </button>
              <button
                onClick={() => openEdit(p)}
                className="rounded bg-surface-container-high px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] text-on-surface uppercase hover:text-primary"
              >
                Sửa
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded bg-surface-container-low p-8">
            <h2 className="font-title-editorial text-title-editorial text-on-surface">
              {isNew ? "Thêm sản phẩm" : `Sửa ${editing.slug}`}
            </h2>
            {!isNew && history.length > 0 && (
              <p className="font-body-sm text-body-sm mt-2 text-on-surface-variant/70">
                Lịch sử:{" "}
                {history
                  .map(
                    (h) =>
                      `${h.action}${h.summary ? ` (${h.summary})` : ""}`
                  )
                  .join(" • ")}
              </p>
            )}
            {error && (
              <p className="font-body-sm text-body-sm mt-4 rounded border border-error/40 bg-error-container/20 px-4 py-3 text-error">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {isNew && (
                <label className="block">
                  <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                    Slug *
                  </span>
                  <input
                    className={inputCls}
                    value={editing.slug}
                    onChange={(e) =>
                      setEditing({ ...editing, slug: e.target.value })
                    }
                    placeholder="vidu-chronos-01"
                  />
                </label>
              )}
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Tên *
                </span>
                <input
                  className={inputCls}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Reference *
                </span>
                <input
                  className={inputCls}
                  value={editing.reference}
                  onChange={(e) =>
                    setEditing({ ...editing, reference: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Collection
                </span>
                <select
                  className={inputCls}
                  value={editing.collection}
                  onChange={(e) =>
                    setEditing({ ...editing, collection: e.target.value })
                  }
                >
                  {[
                    "tourbillon",
                    "grand-complication",
                    "skeleton",
                    "sport",
                    "classic",
                    "accessory",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Giá USD *
                </span>
                <input
                  className={inputCls}
                  type="number"
                  value={editing.priceUsd}
                  onChange={(e) =>
                    setEditing({ ...editing, priceUsd: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Calibre
                </span>
                <input
                  className={inputCls}
                  value={editing.calibre}
                  onChange={(e) =>
                    setEditing({ ...editing, calibre: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Đường kính (mm)
                </span>
                <input
                  className={inputCls}
                  type="number"
                  value={editing.diameterMm}
                  onChange={(e) =>
                    setEditing({ ...editing, diameterMm: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Tồn kho
                </span>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={editing.stock}
                  onChange={(e) =>
                    setEditing({ ...editing, stock: e.target.value })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Vật liệu vỏ
                </span>
                <input
                  className={inputCls}
                  value={editing.caseMaterial}
                  onChange={(e) =>
                    setEditing({ ...editing, caseMaterial: e.target.value })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Nhãn dây
                </span>
                <input
                  className={inputCls}
                  value={editing.strapLabel}
                  onChange={(e) =>
                    setEditing({ ...editing, strapLabel: e.target.value })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Ảnh bìa (URL hoặc upload)
                </span>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    value={editing.cardImage}
                    onChange={(e) =>
                      setEditing({ ...editing, cardImage: e.target.value })
                    }
                  />
                  <label className="shrink-0 cursor-pointer rounded bg-surface-container-high px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] text-on-surface uppercase hover:text-primary">
                    {uploading ? "..." : "Upload"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(f, "card");
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </label>
              <label className="block md:col-span-2">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Mô tả ngắn
                </span>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={editing.shortDescription}
                  onChange={(e) =>
                    setEditing({ ...editing, shortDescription: e.target.value })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Ảnh chi tiết (mỗi dòng 1 URL)
                </span>
                <div className="mb-2">
                  <label className="inline-block cursor-pointer rounded bg-surface-container-high px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] text-on-surface uppercase hover:text-primary">
                    {uploading ? "Đang upload..." : "+ Thêm ảnh từ máy"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(f, "gallery");
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={editing.images}
                  onChange={(e) =>
                    setEditing({ ...editing, images: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Badges (cách nhau dấu phẩy)
                </span>
                <input
                  className={inputCls}
                  value={editing.badges}
                  onChange={(e) =>
                    setEditing({ ...editing, badges: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Complications (cách nhau dấu phẩy)
                </span>
                <input
                  className={inputCls}
                  value={editing.complications}
                  onChange={(e) =>
                    setEditing({ ...editing, complications: e.target.value })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Câu chuyện (narrative)
                </span>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={editing.narrative}
                  onChange={(e) =>
                    setEditing({ ...editing, narrative: e.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editing.inBoutique}
                  onChange={(e) =>
                    setEditing({ ...editing, inBoutique: e.target.checked })
                  }
                  className="h-5 w-5 accent-primary"
                />
                <span className="font-label-spec text-label-spec tracking-wider text-on-surface-variant uppercase">
                  Trưng bày ở boutique
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded px-5 py-3 font-label-spec text-label-spec tracking-[0.2em] text-on-surface-variant uppercase hover:text-on-surface"
              >
                Hủy
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded bg-primary px-6 py-3 font-label-spec text-label-spec font-semibold tracking-[0.2em] text-on-primary uppercase hover:bg-secondary disabled:opacity-50"
              >
                {busy ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
