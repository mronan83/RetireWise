import { AlertTriangle, Scale } from "lucide-react";
import { taxTableFreshness, type TaxTable } from "@/lib/tax/table";
import { cn } from "@/lib/utils";

/**
 * Which tax year every number on the page was computed with.
 *
 * The brackets on this site were once commented "2025" while carrying 2024
 * figures, and the product had no way to say so — there was no year in the
 * data model and nothing on screen that named one. This is that missing
 * sentence: the year, where it came from, and how far behind it is.
 *
 * Current reads as an ordinary caption. One year behind is amber and says
 * what to do about it, because the IRS publishes in the autumn and being a
 * year behind in January is normal, not broken. Two or more is destructive
 * red, because at that point every tax figure on the page is wrong by a
 * known amount and quietly.
 */
export function TaxYearBadge({
  table,
  className,
}: {
  table: Pick<TaxTable, "taxYear" | "source">;
  className?: string;
}) {
  const f = taxTableFreshness(table);
  const alert = f.status !== "current" || f.source === "built-in";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        alert
          ? f.status === "very-stale"
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-500"
          : "border-border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      {alert ? (
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
      ) : (
        <Scale className="mt-px size-3.5 shrink-0" aria-hidden />
      )}
      <p className="leading-relaxed">
        <span className="font-medium">{f.label}</span>
        {" — "}
        {f.detail}
      </p>
    </div>
  );
}
