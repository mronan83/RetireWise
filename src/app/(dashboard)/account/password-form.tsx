"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type AuthFormState } from "@/lib/actions/auth";

export function PasswordForm() {
  const [state, formAction, isPending] = useActionState<
    AuthFormState,
    FormData
  >(updatePassword, {});

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      {state.notice && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
        >
          {state.notice}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
