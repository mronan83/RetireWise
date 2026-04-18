"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  text: string;
  className?: string;
};

export function HelpTip({ text, className }: Props) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className || ""}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
