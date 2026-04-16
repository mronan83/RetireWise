"use client";

import { useState } from "react";
import { Users, Copy, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Props = {
  household: {
    id: string;
    inviteCode: string | null;
    members: { clerkId: string; role: string; joinedAt: Date }[];
  } | null;
};

export function HouseholdSharing({ household }: Props) {
  const [inviteCode, setInviteCode] = useState(household?.inviteCode || "");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/household/create", { method: "POST" });
      const data = await res.json();
      if (data.inviteCode) {
        setInviteCode(data.inviteCode);
        setMessage({
          type: "success",
          text: "Household created! Share the invite code with your spouse.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to create household." });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setMessage(null);
    try {
      const res = await fetch("/api/household/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: "Joined household! Refresh the page to see shared data.",
        });
      } else {
        setMessage({ type: "error", text: data.error || "Invalid code." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to join." });
    } finally {
      setJoining(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const memberCount = household?.members.length || 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Share access so your spouse can log in with their own account and see
        the same household data — accounts, holdings, projections, everything.
      </p>

      {household ? (
        <div className="space-y-4">
          {/* Existing household */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Users className="mr-1 h-3 w-3" />
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </Badge>
            {memberCount >= 2 && (
              <Badge className="text-xs text-green-500 bg-green-500/10">
                Sharing active
              </Badge>
            )}
          </div>

          {/* Invite code */}
          <div className="space-y-2">
            <Label>Invite Code</Label>
            <div className="flex gap-2">
              <Input
                value={inviteCode}
                readOnly
                className="font-mono text-lg tracking-wider"
              />
              <Button variant="outline" onClick={copyCode}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Give this code to your spouse. They sign up for RetireWise, go to
              Settings &gt; Household Sharing, and enter this code to join.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Create or join */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Create Household</span>
              </div>
              <p className="text-xs text-muted-foreground">
                You&apos;re the primary account holder. Create a household to
                get an invite code for your spouse.
              </p>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create Household"}
              </Button>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Join Household</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your spouse already set up RetireWise? Enter their invite code
                to see the shared data.
              </p>
              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter code"
                  className="font-mono uppercase"
                />
                <Button onClick={handleJoin} disabled={joining || !joinCode.trim()}>
                  {joining ? "..." : "Join"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.type === "success"
              ? "bg-green-500/10 text-green-500"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
