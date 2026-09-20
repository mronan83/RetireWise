import type { LanguageModel } from "ai";
import { resolveClaudeModel } from "./models";

/** Providers a user can choose. Each one requires that user's own API key. */
export const USER_PROVIDERS = ["anthropic", "google", "openai"] as const;
export type UserProvider = (typeof USER_PROVIDERS)[number];

export function isUserProvider(value: unknown): value is UserProvider {
  return typeof value === "string" && (USER_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Thrown when the household has not supplied a key for its chosen provider.
 *
 * A distinct type so route handlers can answer 400 with a message that points
 * at Settings, rather than letting a provider error surface as a 500 that
 * reads like the app is broken.
 */
export class MissingApiKeyError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(
      `No ${getProviderLabel(provider)} API key on file. Add your own key in Settings → AI provider.`
    );
    this.name = "MissingApiKeyError";
    this.provider = provider;
  }
}

/**
 * Build the language model for a provider using the caller's own API key.
 *
 * There is deliberately no fallback to a server-side key. AI usage is billed
 * per token to whoever owns the key, so a fallback would quietly move every
 * user's inference cost onto the app operator's account — an expense that
 * grows with usage and shows up on a card statement rather than in an error.
 * If a household wants the AI features, it brings its own key.
 */
export function getModel(
  provider: string | undefined,
  userApiKey: string | undefined,
  claudeModel?: string | null
): LanguageModel {
  const p = provider || "anthropic";

  if (p === "gateway") {
    // App-funded inference. Off unless the operator explicitly opts in, and
    // never selectable from Settings — see the POST handler in
    // /api/settings/ai-provider.
    if (process.env.AI_GATEWAY_ENABLED !== "true" || !process.env.AI_GATEWAY_API_KEY) {
      throw new MissingApiKeyError("anthropic");
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { gateway } = require("ai");
    return gateway(`anthropic/${resolveClaudeModel(claudeModel)}`);
  }

  if (!isUserProvider(p)) {
    throw new Error(`Unknown AI provider "${p}". Use: anthropic, google, or openai.`);
  }

  if (!userApiKey) throw new MissingApiKeyError(p);

  switch (p) {
    case "anthropic": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAnthropic } = require("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: userApiKey })(resolveClaudeModel(claudeModel));
    }
    case "google": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createGoogleGenerativeAI } = require("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey: userApiKey })("gemini-2.0-flash");
    }
    case "openai": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createOpenAI } = require("@ai-sdk/openai");
      return createOpenAI({ apiKey: userApiKey })("gpt-4.1");
    }
  }
}

export function getProviderLabel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Claude (Anthropic)";
    case "google":
      return "Gemini 2.0 Flash (Google)";
    case "openai":
      return "GPT-4.1 (OpenAI)";
    case "gateway":
      return "Vercel AI Gateway";
    default:
      return provider;
  }
}
