import { AuthForm } from "../auth-form";
import { signIn } from "@/lib/actions/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <AuthForm mode="sign-in" action={signIn} initialError={error} />
    </div>
  );
}
