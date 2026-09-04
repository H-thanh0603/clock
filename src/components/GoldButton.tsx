import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type GoldButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary";
  icon?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export default function GoldButton({
  children,
  href,
  variant = "primary",
  icon,
  className = "",
  ...rest
}: GoldButtonProps) {
  const base = `inline-flex items-center justify-center gap-2 px-7 py-3.5 text-[11px] font-bold tracking-[0.2em] uppercase transition-all duration-300 ${className}`;
  const styles =
    variant === "primary"
      ? "bg-primary text-surface-lowest hover:bg-primary-hover"
      : "bg-surface-container text-primary border border-outline-variant/40 hover:border-primary hover:text-primary-hover";

  const content = (
    <>
      {children}
      {icon && <span className="material-symbols-outlined text-[16px]">{icon}</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${base} ${styles}`}>
        {content}
      </Link>
    );
  }
  return (
    <button className={`${base} ${styles}`} {...rest}>
      {content}
    </button>
  );
}
