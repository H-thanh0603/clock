export default function SpecBadge({
  children,
  gold = false,
}: {
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <span
      className={`spec-badge px-2.5 py-1 ${
        gold
          ? "border-primary-container/50 bg-primary/5 text-primary"
          : "bg-surface-lowest/60"
      }`}
    >
      {children}
    </span>
  );
}
