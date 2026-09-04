import type { ReactNode } from "react";

export default function SectionHeading({
  label,
  title,
  align = "center",
  children,
}: {
  label: string;
  title: ReactNode;
  align?: "center" | "left";
  children?: ReactNode;
}) {
  const alignCls = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <div className={`flex flex-col gap-4 ${alignCls}`}>
      <span className="text-[11px] font-semibold tracking-[0.35em] text-primary uppercase">
        {label}
      </span>
      <h2 className="font-display text-3xl leading-tight font-medium text-on-surface md:text-4xl">
        {title}
      </h2>
      {children && (
        <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant/80 md:text-base">
          {children}
        </p>
      )}
    </div>
  );
}
