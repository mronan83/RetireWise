// No `import "server-only"` here, unlike the rest of the server modules:
// scripts/test-invites.ts exercises this file directly under Node, and that
// package throws outside a bundler that sets the react-server condition.
// The node:crypto import below fails loudly in a client bundle anyway.
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { getEntitlements } from "./billing/entitlements";
import { recordAudit } from "./audit";
import {
  householdInvites,
  householdJoinAttempts,
  householdMembers,
  households,
} from "./db/schema";

/**
 * Crockford base32: no I, L, O or U.
 *
 * Someone reads this code off a phone screen and types it into another one, so
 * the characters that get misread as each other are simply not in the
 * alphabet, and the two that still get typed by habit are mapped on input.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 80 bits, in four groups of four. */
const CODE_CHARS = 16;

export const INVITE_TTL_DAYS = 7;

/** Failed redemptions allowed per account per hour. */
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A new invite code.
 *
 * 80 bits from the system CSPRNG. Rejection sampling keeps the distribution
 * flat — taking `byte % 32` would make the first eight letters of the alphabet
 * slightly likelier than the rest, which is a small bias but a free one to
 * avoid.
 */
export function generateInviteCode(): string {
  let out = "";
  while (out.length < CODE_CHARS) {
    for (const byte of randomBytes(CODE_CHARS)) {
      if (byte >= 248) continue; // 248 = 8 * 31, the largest multiple of 32
      out += ALPHABET[byte % 32];
      if (out.length === CODE_CHARS) break;
    }
  }
  return out.match(/.{4}/g)!.join("-");
}

/** Strip formatting and fold the characters people type by habit. */
export function normalizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

function hashInviteCode(code: string): string {
  return createHash("sha256").update(normalizeInviteCode(code)).digest("hex");
}

/**
 * Compare two hashes without leaking where they diverge.
 *
 * The lookup below is by indexed equality, which is not constant time, but the
 * value being compared is a hash of an 80-bit secret — timing tells an
 * attacker nothing they could use before the rate limit stops them. This is
 * belt and braces for the final check.
 */
function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type Invite = {
  id: string;
  codeHint: string;
  label: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: "active" | "used" | "revoked" | "expired";
};

function statusOf(row: {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): Invite["status"] {
  if (row.revokedAt) return "revoked";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
}

/**
 * Issue an invite.
 *
 * The plaintext code is returned once and is not recoverable afterwards — only
 * its hash is stored. If it is lost, the invite is revoked and a new one
 * issued, which is the behaviour you want anyway.
 */
export async function createInvite(
  householdId: string,
  createdBy: string,
  label?: string
): Promise<{ code: string; invite: Invite }> {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await getDb()
    .insert(householdInvites)
    .values({
      householdId,
      codeHash: hashInviteCode(code),
      codeHint: normalizeInviteCode(code).slice(-4),
      createdBy,
      label: label?.trim() || null,
      expiresAt,
    })
    .returning();

  await recordAudit({
    clerkId: createdBy,
    actorId: createdBy,
    action: "invite.created",
    entity: "household_invite",
    entityId: row.id,
    detail: { hint: row.codeHint, expiresAt: expiresAt.toISOString() },
  });

  return { code, invite: { ...row, status: statusOf(row) } };
}

export async function listInvites(householdId: string): Promise<Invite[]> {
  const rows = await getDb()
    .select()
    .from(householdInvites)
    .where(eq(householdInvites.householdId, householdId))
    .orderBy(desc(householdInvites.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, status: statusOf(r) }));
}

/** Revoke an invite. Scoped to the household so an id alone is not enough. */
export async function revokeInvite(
  inviteId: string,
  householdId: string
): Promise<boolean> {
  const rows = await getDb()
    .update(householdInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(householdInvites.id, inviteId),
        eq(householdInvites.householdId, householdId),
        isNull(householdInvites.revokedAt),
        isNull(householdInvites.usedAt)
      )
    )
    .returning({ id: householdInvites.id });

  if (rows.length > 0) {
    await recordAudit({
      clerkId: householdId,
      action: "invite.revoked",
      entity: "household_invite",
      entityId: inviteId,
    });
  }
  return rows.length > 0;
}

export type RedeemFailure =
  | "invalid"
  | "expired"
  | "used"
  | "revoked"
  | "rate_limited"
  | "already_member"
  | "household_full";

export type RedeemResult =
  | { ok: true; householdId: string }
  | { ok: false; reason: RedeemFailure };

/**
 * Redeem an invite and join its household.
 *
 * Every outcome except success is recorded as a failed attempt, and every
 * failure returns the same message to the caller. Distinguishing "no such
 * code" from "expired code" would turn the endpoint into an oracle that
 * confirms which codes exist.
 */
export async function redeemInvite(
  rawCode: string,
  clerkId: string
): Promise<RedeemResult> {
  const db = getDb();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(householdJoinAttempts)
    .where(
      and(
        eq(householdJoinAttempts.clerkId, clerkId),
        eq(householdJoinAttempts.succeeded, false),
        gte(
          householdJoinAttempts.attemptedAt,
          new Date(Date.now() - ATTEMPT_WINDOW_MS)
        )
      )
    );

  if (count >= MAX_FAILED_ATTEMPTS) {
    return { ok: false, reason: "rate_limited" };
  }

  const record = async (succeeded: boolean) => {
    await db.insert(householdJoinAttempts).values({ clerkId, succeeded });
  };

  const normalized = normalizeInviteCode(rawCode);
  if (normalized.length !== CODE_CHARS) {
    await record(false);
    return { ok: false, reason: "invalid" };
  }

  const hash = hashInviteCode(normalized);
  const [invite] = await db
    .select()
    .from(householdInvites)
    .where(eq(householdInvites.codeHash, hash))
    .limit(1);

  if (!invite || !hashesMatch(invite.codeHash, hash)) {
    await record(false);
    return { ok: false, reason: "invalid" };
  }

  const status = statusOf(invite);
  if (status !== "active") {
    await record(false);
    return { ok: false, reason: status === "expired" ? "expired" : status };
  }

  const existing = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    await record(false);
    return { ok: false, reason: "already_member" };
  }

  // Household size is a plan limit, and it belongs to the household being
  // joined rather than to the person joining. Checked here, behind a valid
  // code and the rate limit, rather than in a separate call that would tell
  // an unauthenticated caller whether a code exists. Unlimited on the free
  // tier, so it never refuses today — but it runs on every redemption, which
  // is the only way to know it still works on the day a limit is set.
  const [{ primaryClerkId }] = await db
    .select({ primaryClerkId: households.primaryClerkId })
    .from(households)
    .where(eq(households.id, invite.householdId))
    .limit(1);

  const { limits } = await getEntitlements(primaryClerkId);
  if (limits.householdMembers !== null) {
    const [{ members }] = await db
      .select({ members: sql<number>`count(*)::int` })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, invite.householdId));
    if (members >= limits.householdMembers) {
      await record(false);
      return { ok: false, reason: "household_full" };
    }
  }

  // Claim the invite before adding the member, and only if it is still
  // unclaimed. Two people redeeming the same code at the same moment both pass
  // the checks above; this UPDATE is what makes exactly one of them win.
  const claimed = await db
    .update(householdInvites)
    .set({ usedAt: new Date(), usedBy: clerkId })
    .where(and(eq(householdInvites.id, invite.id), isNull(householdInvites.usedAt)))
    .returning({ id: householdInvites.id });

  if (claimed.length === 0) {
    await record(false);
    return { ok: false, reason: "used" };
  }

  await db.insert(householdMembers).values({
    householdId: invite.householdId,
    clerkId,
    role: "member",
  });

  await record(true);
  // Keyed to the household that was joined, because that is whose data the
  // new member can now see.
  await recordAudit({
    clerkId: primaryClerkId,
    actorId: clerkId,
    action: "invite.redeemed",
    entity: "household_invite",
    entityId: invite.id,
    detail: { hint: invite.codeHint },
  });
  return { ok: true, householdId: invite.householdId };
}

/** The household this account owns or belongs to, with its id. */
export async function householdFor(clerkId: string) {
  const rows = await getDb()
    .select({
      id: households.id,
      primaryClerkId: households.primaryClerkId,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.clerkId, clerkId))
    .limit(1);
  return rows[0] ?? null;
}
