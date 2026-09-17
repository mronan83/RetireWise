"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/lib/actions/auth";

type Props = {
  mode: "sign-in" | "sign-up";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  initialError?: string;
};

export function AuthForm({ mode, action, initialError }: Props) {
  const [state, formAction, isPending] = useActionState(action, {
    error: initialError,
  });

  const isSignUp = mode === "sign-up";

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1.5 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 20L8 13L12 16L21 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 4L21 4L21 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isSignUp ? "Create your account" : "Sign in to RetireWise"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignUp
            ? "Track your household's retirement in one place."
            : "Welcome back."}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
          />
          {isSignUp && (
            <p className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          )}
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

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending
            ? isSignUp
              ? "Creating account…"
              : "Signing in…"
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-primary hover:underline"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
