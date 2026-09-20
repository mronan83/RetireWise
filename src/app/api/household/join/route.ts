import { joinHousehold } from "@/lib/household";
import type { RedeemFailure } from "@/lib/invites";

/**
 * Every failure reads the same to the caller.
 *
 * "No such code" and "that code expired" would together turn this endpoint
 * into an oracle for which codes exist. The rate limit and the wording are
 * the two halves of the same defence, so only the two outcomes that are about
 * the caller's own account — already in a household, out of attempts — say
 * anything specific.
 */
const MESSAGES: Record<RedeemFailure, string> = {
  invalid: "That invite code is not valid.",
  expired: "That invite code is not valid.",
  used: "That invite code is not valid.",
  revoked: "That invite code is not valid.",
  already_member: "You are already part of a household.",
  household_full: "That household is full.",
  rate_limited: "Too many attempts. Try again in an hour.",
};

const STATUS: Record<RedeemFailure, number> = {
  invalid: 400,
  expired: 400,
  used: 400,
  revoked: 400,
  already_member: 409,
  household_full: 409,
  rate_limited: 429,
};

export async function POST(request: Request) {
  try {
    const { inviteCode } = await request.json();
    if (typeof inviteCode !== "string" || !inviteCode.trim()) {
      return Response.json({ error: MESSAGES.invalid }, { status: 400 });
    }

    const result = await joinHousehold(inviteCode);
    if (result.ok) return Response.json({ success: true });

    return Response.json(
      { error: MESSAGES[result.reason], code: result.reason },
      { status: STATUS[result.reason] }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
