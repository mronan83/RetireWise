"use client";

import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";

export function UserMenu({ email }: { email: string | null }) {
  const initial = email?.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email ?? "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserIcon className="mr-2 h-3.5 w-3.5" />
          Your account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* A form, not an onClick: the action redirects, and a bare call
            outside a transition would leave the redirect unapplied. */}
        <form action={signOut}>
          <DropdownMenuItem
            render={<button type="submit" className="w-full" />}
            closeOnClick={false}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
