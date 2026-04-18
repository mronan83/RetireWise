"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Menu, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";

export function DashboardHeader({ isDemo = false }: { isDemo?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-4 border-b bg-background/95 px-3 sm:px-4 backdrop-blur-sm lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMenuOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarNav />
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <ThemeToggle />
      {isDemo ? (
        <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1">
          <Eye className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium text-amber-500">Demo</span>
        </div>
      ) : (
        <UserButton />
      )}
    </header>
  );
}
