/**
 * Expected annual return by the household's stated risk tolerance.
 *
 * One table, because the analytics page and the tools behind the AI advisor
 * each had their own copy — and a copy is a thing that drifts.
 */
export const RETURN_BY_RISK: Record<string, number> = {
  conservative: 5,
  moderate: 7,
  aggressive: 9,
};
