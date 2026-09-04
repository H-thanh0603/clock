export default function SpecBadge({
  children,
  gold = false,
}: {
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <span
      className={`spec-badge backdrop-blur-sm px-2.5 py-1 ${
        gold
          ? "border-primary-container/50 bg-surface-lowest/80 text-primary"
          : "bg-surface-lowest/60"
      }`}
    >
      {children}
    </span>
  );
}
