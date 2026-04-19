"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  BarChart3,
  ArrowRightLeft,
  Brain,
  LineChart,
  Settings,
  Upload,
  TrendingUp,
  Landmark,
  UserCircle,
  Calculator,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/holdings", label: "Holdings", icon: BarChart3 },
  { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  { href: "/net-worth", label: "Net Worth", icon: Landmark },
  { href: "/analysis", label: "AI Analysis", icon: Brain },
  { href: "/projections", label: "Projections", icon: LineChart },
  { href: "/analytics", label: "Analytics", icon: Calculator },
  { href: "/import", label: "Import Data", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
  { href: "/account", label: "Account", icon: UserCircle },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      <div className="mb-4 flex items-center gap-2.5 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M3 20L8 13L12 16L21 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 4L21 4L21 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-lg font-bold tracking-tight">RetireWise</span>
      </div>
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
