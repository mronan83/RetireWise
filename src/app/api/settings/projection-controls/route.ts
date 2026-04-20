import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const db = getDb();
  const existing = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  const data: Record<string, unknown> = { updatedAt: new Date() };

  if (body.ssClaimAgeSelf !== undefined) data.projectionSSClaimAgeSelf = body.ssClaimAgeSelf;
  if (body.ssClaimAgeSpouse !== undefined) data.projectionSSClaimAgeSpouse = body.ssClaimAgeSpouse;
  if (body.monthlySpending !== undefined) data.projectionMonthlySpending = String(body.monthlySpending);
  if (body.withdrawalRate !== undefined) data.projectionWithdrawalRate = String(body.withdrawalRate);
  if (body.maxWithdrawalAmount !== undefined) data.projectionMaxWithdrawalAmount = body.maxWithdrawalAmount != null ? String(body.maxWithdrawalAmount) : null;
  if (body.retirementYears !== undefined) data.projectionRetirementYears = body.retirementYears;
  if (body.marketScenario !== undefined) data.projectionMarketScenario = body.marketScenario;
  if (body.withdrawalMethod !== undefined) data.projectionWithdrawalMethod = body.withdrawalMethod;

  // Glide path rebalancing controls
  if (body.glidePathEnabled !== undefined) data.glidePathEnabled = body.glidePathEnabled;
  if (body.glidePathStartProfile !== undefined) data.glidePathStartProfile = body.glidePathStartProfile;
  if (body.glidePathEndProfile !== undefined) data.glidePathEndProfile = body.glidePathEndProfile;
  if (body.glidePathTransitionStartAge !== undefined) data.glidePathTransitionStartAge = body.glidePathTransitionStartAge;
  if (body.glidePathTransitionEndAge !== undefined) data.glidePathTransitionEndAge = body.glidePathTransitionEndAge;
  if (body.glidePathCurve !== undefined) data.glidePathCurve = body.glidePathCurve;

  // Catch-up contributions
  if (body.catchUpEnabled !== undefined) data.catchUpEnabled = body.catchUpEnabled;

  if (existing.length > 0) {
    await db.update(userPreferences).set(data).where(eq(userPreferences.clerkId, userId));
  } else {
    await db.insert(userPreferences).values({ clerkId: userId, ...data });
  }

  return Response.json({ success: true });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const prefs = await db
    .select({
      ssClaimAgeSelf: userPreferences.projectionSSClaimAgeSelf,
      ssClaimAgeSpouse: userPreferences.projectionSSClaimAgeSpouse,
      monthlySpending: userPreferences.projectionMonthlySpending,
      withdrawalRate: userPreferences.projectionWithdrawalRate,
      maxWithdrawalAmount: userPreferences.projectionMaxWithdrawalAmount,
      retirementYears: userPreferences.projectionRetirementYears,
      marketScenario: userPreferences.projectionMarketScenario,
      withdrawalMethod: userPreferences.projectionWithdrawalMethod,
      glidePathEnabled: userPreferences.glidePathEnabled,
      glidePathStartProfile: userPreferences.glidePathStartProfile,
      glidePathEndProfile: userPreferences.glidePathEndProfile,
      glidePathTransitionStartAge: userPreferences.glidePathTransitionStartAge,
      glidePathTransitionEndAge: userPreferences.glidePathTransitionEndAge,
      glidePathCurve: userPreferences.glidePathCurve,
      catchUpEnabled: userPreferences.catchUpEnabled,
    })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  return Response.json(prefs[0] || {});
}
