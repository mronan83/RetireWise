import { UserProfile } from "@clerk/nextjs";

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Account</h1>
        <p className="text-muted-foreground">
          Manage your login, security, and profile
        </p>
      </div>
      <UserProfile />
    </div>
  );
}
