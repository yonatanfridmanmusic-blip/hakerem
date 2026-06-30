/** Renders a currency value with tabular-num formatting */
export function MoneyCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: "var(--hk-ink-3)" }}>—</span>;
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
  return (
    <span
      className="num"
      style={{ fontSize: "13px", color: "var(--hk-ink)", whiteSpace: "nowrap" }}
    >
      {formatted}
    </span>
  );
}
