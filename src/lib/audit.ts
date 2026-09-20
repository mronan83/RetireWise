import { getDb } from "./db";
import { auditLog } from "./db/schema";

/**
 * Actions worth a permanent record.
 *
 * A closed set rather than free text, so the log can be read by eye and
 * queried without guessing at spellings. Each one either changes who can
 * reach a household's data or removes something that cannot be recovered.
 */
export type AuditAction =
  | "invite.created"
  | "invite.revoked"
  | "invite.redeemed"
  | "household.created"
  | "ai_key.stored"
  | "ai_key.removed"
  | "plaid.linked"
  | "plaid.disconnected"
  | "account.deleted"
  | "billing.subscribed"
  | "billing.cancelled"
  | "data.exported"
  | "account.deletion_requested";

/**
 * Record an action. Never throws.
 *
 * Auditing is a side effect of the work, not a precondition for it: failing a
 * password change because the log write failed would be the wrong trade. A
 * failure is logged to the console, where the platform's own log collection
 * picks it up.
 */
export async function recordAudit(params: {
  clerkId: string;
  actorId?: string | null;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getDb().insert(auditLog).values({
      clerkId: params.clerkId,
      actorId: params.actorId ?? null,
      action: params.action,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      detail: params.detail ?? null,
    });
  } catch (e) {
    console.error(`Audit write failed for ${params.action}:`, e);
  }
}
