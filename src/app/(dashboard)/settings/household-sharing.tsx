"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Copy, Check, Link2, Loader2, Plus, Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Invite = {
  id: string;
  codeHint: string;
  label: string | null;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "used" | "revoked" | "expired";
};

type Props = {
  household: {
    id: string;
    isPrimary: boolean;
    members: { clerkId: string; role: string; joinedAt: Date }[];
  } | null;
};

const STATUS_STYLE: Record<Invite["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  used: "bg-muted text-muted-foreground",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function HouseholdSharing({ household }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [ttlDays, setTtlDays] = useState(7);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isPrimary = household?.isPrimary ?? false;

  const loadInvites = useCallback(async () => {
    if (!isPrimary) return;
    try {
      const res = await fetch("/api/household/invites");
      if (!res.ok) return;
      const data = await res.json();
      setInvites(data.invites ?? []);
      if (data.ttlDays) setTtlDays(data.ttlDays);
    } catch {
      // A failed list leaves the existing view in place rather than blanking it.
    }
  }, [isPrimary]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const handleCreateHousehold = async () => {
    setBusy("household");
    setMessage(null);
    try {
      const res = await fetch("/api/household/create", { method: "POST" });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      setMessage({ type: "error", text: "Could not create the household." });
      setBusy(null);
    }
  };

  const handleCreateInvite = async () => {
    setBusy("invite");
    setMessage(null);
    try {
      const res = await fetch("/api/household/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFreshCode(data.code);
      await loadInvites();
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error && e.message ? e.message : "Could not create an invite.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch("/api/household/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      if (freshCode) setFreshCode(null);
      await loadInvites();
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error && e.message ? e.message : "Could not revoke that invite.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setBusy("join");
    setMessage(null);
    try {
      const res = await fetch("/api/household/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Joined. Reloading…" });
        setTimeout(() => window.location.reload(), 900);
      } else {
        setMessage({ type: "error", text: data.error || "That invite code is not valid." });
      }
    } catch {
      setMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  };

  const copyCode = () => {
    if (!freshCode) return;
    navigator.clipboard.writeText(freshCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const memberCount = household?.members.length ?? 0;
  const activeInvites = invites.filter((i) => i.status === "active");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Share access so your spouse can sign in with their own account and see the
        same household data — accounts, holdings, projections, everything.
      </p>

      {household ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Users className="mr-1 h-3 w-3" />
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </Badge>
            {memberCount >= 2 && (
              <Badge className="bg-emerald-500/10 text-xs text-emerald-600">Sharing active</Badge>
            )}
            {!isPrimary && <Badge variant="outline" className="text-xs">You joined this household</Badge>}
          </div>

          {isPrimary ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Invitations</Label>
                <Button size="sm" variant="outline" onClick={handleCreateInvite} disabled={busy !== null}>
                  {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  New invite
                </Button>
              </div>

              {freshCode && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Copy this now — it is not shown again
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={freshCode}
                      readOnly
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono text-base tracking-wider"
                    />
                    <Button variant="outline" onClick={copyCode}>
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Single use, expires in {ttlDays} days. Only the code&apos;s fingerprint is
                    stored, so nobody — including this app — can read it back later.
                  </p>
                </div>
              )}

              {invites.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No invitations yet. Create one when someone is ready to join.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {invites.slice(0, 8).map((invite) => (
                    <li key={invite.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm">····-····-····-{invite.codeHint}</p>
                        <p className="text-xs text-muted-foreground">
                          {invite.status === "active"
                            ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                            : invite.status === "used"
                              ? `Used ${new Date(invite.usedAt!).toLocaleDateString()}`
                              : invite.status === "revoked"
                                ? "Revoked"
                                : "Expired"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge className={`text-[10px] ${STATUS_STYLE[invite.status]}`}>
                          {invite.status}
                        </Badge>
                        {invite.status === "active" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(invite.id)}
                            disabled={busy !== null}
                            aria-label="Revoke invite"
                          >
                            {busy === invite.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {activeInvites.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {activeInvites.length} invitation{activeInvites.length !== 1 ? "s" : ""} can
                  still be redeemed. Revoke any you did not hand out.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only the household owner can issue invitations.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Create household</span>
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;re the primary account holder. Create a household, then issue an
              invitation when your spouse is ready.
            </p>
            <Button onClick={handleCreateHousehold} disabled={busy !== null} className="w-full">
              {busy === "household" ? "Creating…" : "Create household"}
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Join household</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Already been sent an invitation? Enter it here.
            </p>
            <div className="flex gap-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABCD-EFGH-JKMN-PQRS"
                className="font-mono uppercase"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button onClick={handleJoin} disabled={busy !== null || !joinCode.trim()}>
                {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
