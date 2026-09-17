import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { currentUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await currentUser();

  const created = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Account</h1>
        <p className="text-muted-foreground">Manage your login and security</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in details</CardTitle>
          <CardDescription>
            The email address you use to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 border-b pb-3">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email ?? "—"}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-muted-foreground">Account created</span>
            <span className="font-medium">{created ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing this signs you out of nothing else — existing sessions stay
            active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>
            Sign out of RetireWise on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
