import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/encryption";
import { getModel, MissingApiKeyError } from "./model";
import type { LanguageModel } from "ai";

const KEY_COLUMNS = {
  anthropic: "anthropicApiKey",
  google: "googleApiKey",
  openai: "openaiApiKey",
} as const;

/**
 * The model this household's AI features should run on, using its own key.
 *
 * Every AI entry point goes through here. The previous arrangement had this
 * lookup copy-pasted into the chat route and the analysis report, and simply
 * missing from the infographic report — which therefore ran on the server's
 * key without anyone noticing, because the only symptom was a bill. One
 * function means a provider can never again be reached by a path that forgot
 * to fetch the key.
 *
 * @throws MissingApiKeyError when no usable key is stored.
 */
export async function resolveUserModel(clerkId: string): Promise<{
  model: LanguageModel;
  provider: string;
}> {
  const db = getDb();
  const rows = await db
    .select({
      aiProvider: userPreferences.aiProvider,
      anthropicModel: userPreferences.anthropicModel,
      anthropicApiKey: userPreferences.anthropicApiKey,
      googleApiKey: userPreferences.googleApiKey,
      openaiApiKey: userPreferences.openaiApiKey,
    })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, clerkId))
    .limit(1);

  const pref = rows[0];
  const provider = pref?.aiProvider || "anthropic";

  let apiKey: string | undefined;
  const column = KEY_COLUMNS[provider as keyof typeof KEY_COLUMNS];
  const stored = column && pref ? pref[column] : null;
  if (stored) {
    try {
      apiKey = decrypt(stored);
    } catch {
      // A key that will not decrypt is a key the household has to replace;
      // treat it as absent rather than passing ciphertext to the provider.
      apiKey = undefined;
    }
  }

  if (!apiKey && provider !== "gateway") throw new MissingApiKeyError(provider);

  return {
    model: getModel(provider, apiKey, pref?.anthropicModel),
    provider,
  };
}

/** Whether this household has a usable key, without building a model. */
export async function hasUsableApiKey(clerkId: string): Promise<boolean> {
  try {
    await resolveUserModel(clerkId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Route-handler friendly form of {@link resolveUserModel}.
 *
 * Returns a ready-to-send 400 instead of throwing, so a household without a
 * key gets an actionable message pointing at Settings rather than a 500.
 */
export async function resolveUserModelOrError(
  clerkId: string
): Promise<
  | { ok: true; model: LanguageModel; provider: string }
  | { ok: false; response: Response }
> {
  try {
    const { model, provider } = await resolveUserModel(clerkId);
    return { ok: true, model, provider };
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      return {
        ok: false,
        response: Response.json(
          { error: e.message, code: "missing_api_key", provider: e.provider },
          { status: 400 }
        ),
      };
    }
    throw e;
  }
}
