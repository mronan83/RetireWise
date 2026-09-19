import { getApiUserId } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { encrypt, decrypt, maskKey } from "@/lib/utils/encryption";
import { CLAUDE_MODELS, isValidClaudeModel, resolveClaudeModel } from "@/lib/ai/models";

const KEY_COLUMNS = {
  anthropic: "anthropicApiKey",
  google: "googleApiKey",
  openai: "openaiApiKey",
} as const;

export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { provider, apiKey, removeKey, claudeModel } = body;

  const db = getDb();
  const existing = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  const data: Record<string, unknown> = { updatedAt: new Date() };

  // Save provider selection
  if (provider && ["anthropic", "google", "openai", "gateway"].includes(provider)) {
    data.aiProvider = provider;
  }

  // Save the Claude model choice. Rejected unless it is one we offer, so a
  // stale or hand-edited value can never reach the provider.
  if (claudeModel !== undefined) {
    if (!isValidClaudeModel(claudeModel)) {
      return Response.json({ error: "Unknown model" }, { status: 400 });
    }
    data.anthropicModel = claudeModel;
  }

  // Save or remove API key
  if (removeKey && removeKey in KEY_COLUMNS) {
    data[KEY_COLUMNS[removeKey as keyof typeof KEY_COLUMNS]] = null;
  } else if (apiKey && provider && provider in KEY_COLUMNS) {
    data[KEY_COLUMNS[provider as keyof typeof KEY_COLUMNS]] = encrypt(apiKey);
  }

  if (existing.length > 0) {
    await db
      .update(userPreferences)
      .set(data)
      .where(eq(userPreferences.clerkId, userId));
  } else {
    await db.insert(userPreferences).values({
      clerkId: userId,
      ...data,
    });
  }

  return Response.json({ success: true });
}

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const prefs = await db
    .select({
      aiProvider: userPreferences.aiProvider,
      anthropicModel: userPreferences.anthropicModel,
      anthropicApiKey: userPreferences.anthropicApiKey,
      googleApiKey: userPreferences.googleApiKey,
      openaiApiKey: userPreferences.openaiApiKey,
    })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  const pref = prefs[0];
  if (!pref) {
    return Response.json({
      provider: "anthropic",
      claudeModel: resolveClaudeModel(null),
      claudeModels: CLAUDE_MODELS,
      keys: {},
    });
  }

  // Return masked keys (never send the real key back to the client)
  const keys: Record<string, { configured: boolean; masked: string | null; source: string }> = {};
  for (const [provider, column] of Object.entries(KEY_COLUMNS)) {
    const encrypted = pref[column as keyof typeof pref] as string | null;
    const hasEnvKey = provider === "anthropic"
      ? !!process.env.ANTHROPIC_API_KEY
      : provider === "google"
        ? !!process.env.GOOGLE_API_KEY
        : !!process.env.OPENAI_API_KEY;

    if (encrypted) {
      try {
        const decrypted = decrypt(encrypted);
        keys[provider] = { configured: true, masked: maskKey(decrypted), source: "user" };
      } catch {
        keys[provider] = { configured: false, masked: null, source: "none" };
      }
    } else if (hasEnvKey) {
      keys[provider] = { configured: true, masked: null, source: "server" };
    } else {
      keys[provider] = { configured: false, masked: null, source: "none" };
    }
  }

  return Response.json({
    provider: pref.aiProvider || "anthropic",
    claudeModel: resolveClaudeModel(pref.anthropicModel),
    claudeModels: CLAUDE_MODELS,
    keys,
  });
}
