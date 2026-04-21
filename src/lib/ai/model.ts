import type { LanguageModel } from "ai";

/**
 * Get the AI model for the given provider.
 * Uses user-provided API key if available, falls back to env var.
 */
export function getModel(provider?: string, userApiKey?: string): LanguageModel {
  const p = provider || process.env.AI_PROVIDER || "anthropic";

  switch (p) {
    case "anthropic": {
      const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("No Anthropic API key configured. Add one in Settings or set ANTHROPIC_API_KEY.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAnthropic } = require("@ai-sdk/anthropic");
      const client = createAnthropic({ apiKey });
      return client("claude-sonnet-4-5-20250929");
    }

    case "google": {
      const apiKey = userApiKey || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("No Google API key configured. Add one in Settings or set GOOGLE_API_KEY.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createGoogleGenerativeAI } = require("@ai-sdk/google");
      const client = createGoogleGenerativeAI({ apiKey });
      return client("gemini-2.0-flash");
    }

    case "openai": {
      const apiKey = userApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("No OpenAI API key configured. Add one in Settings or set OPENAI_API_KEY.");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createOpenAI } = require("@ai-sdk/openai");
      const client = createOpenAI({ apiKey });
      return client("gpt-4.1");
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
