import { formatCompactCurrency, formatCurrency } from "@/lib/utils/format";

/**
 * A currency figure sized for the screen it is on.
 *
 * "$10,818,330.00" needs about 260px. Two of those side by side on a 390px
 * phone is how a summary card ends up clipping its own number. Cents also
 * carry no information at seven figures — nobody plans a retirement to the
 * penny — so the phone gets "$10.8M" and the desktop keeps the full figure.
 *
 * Rendered as two spans rather than a media query in JS so it is correct in
 * the server-rendered HTML and never flips after hydration.
 */
export function Money({ value, compactTo = "sm" }: { value: number; compactTo?: "sm" | "md" | "lg" }) {
  const hideCompact = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden" }[compactTo];
  const showFull = { sm: "hidden sm:inline", md: "hidden md:inline", lg: "hidden lg:inline" }[compactTo];
  return (
    <>
      <span className={hideCompact}>{formatCompactCurrency(value)}</span>
      <span className={showFull}>{formatCurrency(value)}</span>
    </>
  );
}
