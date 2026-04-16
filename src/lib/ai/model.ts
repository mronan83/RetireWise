import type { LanguageModel } from "ai";

/**
 * Get the AI model for the given provider.
 * Provider can be: "anthropic", "google", "openai", or "gateway"
 */
export function getModel(provider?: string): LanguageModel {
  const p = provider || process.env.AI_PROVIDER || "anthropic";

  switch (p) {
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { anthropic } = require("@ai-sdk/anthropic");
      return anthropic("claude-sonnet-4.5");
    }

    case "google": {
      if (!process.env.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is not set.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { google } = require("@ai-sdk/google");
      return google("gemini-2.0-flash");
    }

    case "openai": {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { openai } = require("@ai-sdk/openai");
      return openai("gpt-4.1");
    }

    case "gateway": {
      if (!process.env.AI_GATEWAY_API_KEY) {
        throw new Error("AI_GATEWAY_API_KEY is not set.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { gateway } = require("ai");
      return gateway("anthropic/claude-sonnet-4.5");
    }

    default:
      throw new Error(
        `Unknown AI provider "${p}". Use: anthropic, google, openai, or gateway.`
      );
  }
}

export function getProviderLabel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Claude Sonnet 4.5 (Anthropic)";
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

export const AVAILABLE_PROVIDERS = [
  {
    id: "anthropic",
    name: "Claude Sonnet 4.5",
    company: "Anthropic",
    description: "Best for nuanced financial analysis and reasoning",
    configured: () => !!process.env.ANTHROPIC_API_KEY,
  },
  {
    id: "google",
    name: "Gemini 2.0 Flash",
    company: "Google",
    description: "Fast and cost-effective, free tier available",
    configured: () => !!process.env.GOOGLE_API_KEY,
  },
  {
    id: "openai",
    name: "GPT-4.1",
    company: "OpenAI",
    description: "Strong general-purpose model",
    configured: () => !!process.env.OPENAI_API_KEY,
  },
] as const;
