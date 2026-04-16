import type { LanguageModel } from "ai";

/**
 * Get the AI model based on which API key is configured.
 * Priority: Anthropic direct > OpenAI direct > Google direct > AI Gateway
 *
 * Set ONE of these in your .env.local:
 *   ANTHROPIC_API_KEY  — uses Claude directly (recommended)
 *   OPENAI_API_KEY     — uses GPT directly
 *   GOOGLE_API_KEY     — uses Gemini directly
 *   AI_GATEWAY_API_KEY — uses Vercel AI Gateway (requires credit card on file)
 */
export function getModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { anthropic } = require("@ai-sdk/anthropic");
    return anthropic("claude-sonnet-4.5");
  }

  if (process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4.1");
  }

  if (process.env.GOOGLE_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require("@ai-sdk/google");
    return google("gemini-2.0-flash");
  }

  if (process.env.AI_GATEWAY_API_KEY) {
    // AI Gateway — requires Vercel credit card on file
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { gateway } = require("ai");
    return gateway("anthropic/claude-sonnet-4.5");
  }

  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or AI_GATEWAY_API_KEY in your environment variables."
  );
}

export function getProviderName(): string {
  if (process.env.ANTHROPIC_API_KEY) return "Anthropic (Claude)";
  if (process.env.OPENAI_API_KEY) return "OpenAI (GPT)";
  if (process.env.GOOGLE_API_KEY) return "Google (Gemini)";
  if (process.env.AI_GATEWAY_API_KEY) return "Vercel AI Gateway";
  return "None configured";
}
