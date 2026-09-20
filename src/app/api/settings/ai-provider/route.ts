import { getApiUserId, withApiHousehold } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { encrypt, decrypt, maskKey } from "@/lib/utils/encryption";
import { CLAUDE_MODELS, isValidClaudeModel, resolveClaudeModel } from "@/lib/ai/models";
import { isUserProvider } from "@/lib/ai/model";
import { recordAudit } from "@/lib/audit";

const KEY_COLUMNS = {
  anthropic: "anthropicApiKey",
  google: "googleApiKey",
  openai: "openaiApiKey",
} as const;

export async function POST(request: Request) {
  return withApiHousehold(() => handlePost(request));
}

async function handlePost(request: Request) {
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

  // Save provider selection.
  //
  // "gateway" is not offered: it runs on the operator's AI_GATEWAY_API_KEY, so
  // letting a household select it would put its inference on someone else's
  // bill. Only providers backed by the household's own key are selectable.
  if (provider && isUserProvider(provider)) {
    data.aiProvider = provider;
  } else if (provider) {
    return Response.json(
      { error: "Choose a provider you have supplied an API key for." },
      { status: 400 }
    );
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
    await recordAudit({
      clerkId: userId,
      action: "ai_key.removed",
      entity: "provider",
      entityId: String(removeKey),
    });
  } else if (apiKey && provider && provider in KEY_COLUMNS) {
    data[KEY_COLUMNS[provider as keyof typeof KEY_COLUMNS]] = encrypt(apiKey);
    // The action, never the key. The whole point of the column being
    // encrypted is defeated if the audit trail holds it in the clear.
    await recordAudit({
      clerkId: userId,
      action: "ai_key.stored",
      entity: "provider",
      entityId: String(provider),
    });
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
  return withApiHousehold(() => handleGet());
}

async function handleGet() {
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

  // Return masked keys (never send the real key back to the client).
  //
  // There is no longer a "server" source: a provider is usable only when this
  // household has stored its own key, because inference is billed to whoever
  // owns the key and the app operator is not paying for other people's usage.
  const keys: Record<string, { configured: boolean; masked: string | null; source: string }> = {};
  for (const [provider, column] of Object.entries(KEY_COLUMNS)) {
    const encrypted = pref[column as keyof typeof pref] as string | null;
    if (!encrypted) {
      keys[provider] = { configured: false, masked: null, source: "none" };
      continue;
    }
    try {
      keys[provider] = {
        configured: true,
        masked: maskKey(decrypt(encrypted)),
        source: "user",
      };
    } catch {
      // Stored but undecryptable — the household has to replace it.
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
