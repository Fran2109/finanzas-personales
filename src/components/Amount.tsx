import { formatCents, type Cents } from "@/lib/money";

/**
 * Un monto. `tone="auto"` pinta el signo; `tone="plain"` lo deja neutro, que es
 * lo que se quiere cuando el signo ya lo dice la columna.
 */
export function Amount({
  cents,
  currency = "ARS",
  tone = "plain",
  className = "",
}: {
  cents: Cents;
  currency?: string;
  tone?: "auto" | "plain" | "negative" | "positive";
  className?: string;
}) {
  const color =
    tone === "auto"
      ? cents < 0
        ? "text-negative"
        : cents > 0
          ? "text-positive"
          : "text-muted"
      : tone === "negative"
        ? "text-negative"
        : tone === "positive"
          ? "text-positive"
          : "";

  return (
    <span className={`tabular ${color} ${className}`}>{formatCents(cents, currency)}</span>
  );
}
