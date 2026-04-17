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
  if (body.retirementYears !== undefined) data.projectionRetirementYears = body.retirementYears;
  if (body.marketScenario !== undefined) data.projectionMarketScenario = body.marketScenario;

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
      retirementYears: userPreferences.projectionRetirementYears,
      marketScenario: userPreferences.projectionMarketScenario,
    })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  return Response.json(prefs[0] || {});
}
