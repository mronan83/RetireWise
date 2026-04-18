"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-sm">
      <Eye className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      <span className="text-amber-500 font-medium">Demo Mode</span>
      <span className="text-amber-500/70 hidden sm:inline">— Viewing sample data. Changes are disabled.</span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 ml-2"
        onClick={() => (window.location.href = "/?demo=false")}
      >
        Exit Demo
      </Button>
    </div>
  );
}
