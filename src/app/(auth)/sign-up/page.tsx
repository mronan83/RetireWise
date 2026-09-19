import { AuthForm } from "../auth-form";
import { signUp } from "@/lib/actions/auth";

export default function SignUpPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <AuthForm mode="sign-up" action={signUp} />
    </div>
  );
}
