import Link from "next/link";
import { PLANNING_FIELDS, type PlanningField } from "@/lib/planning-inputs";

/**
 * Shown in place of a figure that cannot be worked out yet: what is needed,
 * why, and a link straight to the field. Never an error, an empty chart or a
 * figure built on a guess.
 */
export function MissingInputs({
  fields,
  title = "A few details first",
  intro,
}: {
  fields: PlanningField[];
  title?: string;
  intro?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed p-6 sm:p-8">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {intro ?? "RetireWise shows this once it knows the following, rather than guess."}
      </p>
      <ul className="mt-4 space-y-3">
        {fields.map((f) => (
          <li key={f} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{PLANNING_FIELDS[f].label}</p>
              <p className="text-sm text-muted-foreground">{PLANNING_FIELDS[f].why}</p>
            </div>
            <Link
              href={PLANNING_FIELDS[f].href}
              className="shrink-0 text-sm font-medium text-primary underline underline-offset-4"
            >
              Add it in Settings
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
