"use client";

import { Download, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExportButtons() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
        <Download className="mr-2 h-3.5 w-3.5" />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => window.open("/api/report/infographic", "_blank")}
        >
          <FileBarChart className="mr-2 h-3.5 w-3.5" />
          Infographic Report
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open("/api/export/report", "_blank")}
        >
          Portfolio Report (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open("/api/export/holdings", "_blank")}
        >
          Holdings (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open("/api/export/transactions", "_blank")}
        >
          Transactions (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
