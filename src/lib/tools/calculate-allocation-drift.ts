import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import { calculateAllocation, calculateAllocationDrift } from "../utils/calculations";
import { ASSET_CLASS_LABELS, DEFAULT_TARGET_ALLOCATION } from "../constants";

export const calculateAllocationDriftTool = tool({
  description:
    "Compare the current portfolio allocation against the target allocation and identify drift. Shows which asset classes are over or underweight.",
  inputSchema: z.object({}),
  execute: async () => {
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [holdings, prefs] = await Promise.all([
      getHoldingsByClerkId(userId),
      db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.clerkId, userId))
        .limit(1),
    ]);

    const allocation = calculateAllocation(holdings);
    const currentPcts: Record<string, number> = {};
    for (const [k, v] of Object.entries(allocation)) {
      currentPcts[k] = v.pct;
    }

    const target =
      (prefs[0]?.targetAllocation as Record<string, number>) ||
      DEFAULT_TARGET_ALLOCATION;

    const drift = calculateAllocationDrift(currentPcts, target);

    const driftLabeled = Object.fromEntries(
      Object.entries(drift).map(([k, v]) => [
        ASSET_CLASS_LABELS[k] || k,
        {
          currentPct: Math.round(v.current * 100) / 100,
          targetPct: Math.round(v.target * 100) / 100,
          driftPct: Math.round(v.drift * 100) / 100,
          status:
            Math.abs(v.drift) < 2
              ? "on_target"
              : v.drift > 0
                ? "overweight"
                : "underweight",
        },
      ])
    );

    return {
      drift: driftLabeled,
      totalValue: holdings.reduce(
        (sum, h) => sum + Number(h.currentValue),
        0
      ),
      recommendation:
        Object.values(drift).some((d) => Math.abs(d.drift) > 5)
          ? "Significant drift detected. Consider rebalancing."
          : "Portfolio is reasonably aligned with target allocation.",
    };
  },
});
