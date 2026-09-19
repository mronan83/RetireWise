/**
 * Selectable Claude models.
 *
 * Kept here rather than inline in getModel() so adding a model is a data
 * change, not a code change — the previous version hardcoded one model id in
 * two places and drifted two generations behind.
 *
 * Prices are USD per million tokens, for showing the tradeoff in Settings.
 */
export type ClaudeModel = {
  id: string;
  name: string;
  description: string;
  inputPerM: number;
  outputPerM: number;
};

export const CLAUDE_MODELS: readonly ClaudeModel[] = [
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    description: "Deepest reasoning. Best for tax strategy and projections.",
    inputPerM: 5,
    outputPerM: 25,
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Strong reasoning at lower cost. A good everyday default.",
    inputPerM: 2,
    outputPerM: 10,
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "Fastest and cheapest. Fine for quick lookups.",
    inputPerM: 1,
    outputPerM: 5,
  },
] as const;

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

export function isValidClaudeModel(id: string | null | undefined): boolean {
  return !!id && CLAUDE_MODELS.some((m) => m.id === id);
}

export function resolveClaudeModel(id: string | null | undefined): string {
  return isValidClaudeModel(id) ? (id as string) : DEFAULT_CLAUDE_MODEL;
}

export function claudeModelName(id: string | null | undefined): string {
  return CLAUDE_MODELS.find((m) => m.id === id)?.name ?? "Claude Opus 5";
}
