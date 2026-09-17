"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; notice?: string };

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email and password." };
  if (password.length < 8) {
    return { error: "Use a password of at least 8 characters." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  // With email confirmation on, no session comes back until the link is opened.
  if (!data.session) {
    return { notice: `Check ${email} for a link to confirm your account.` };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Use a password of at least 8 characters." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  return { notice: "Password updated." };
}
