"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoldingForm } from "@/components/forms/holding-form";
import { createHolding } from "@/lib/actions/holdings";
import type { Account } from "@/lib/types";

export function AddHoldingPageButton({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);

  if (accounts.length === 0) {
    return (
      <Button disabled>
        <Plus className="mr-2 h-4 w-4" />
        Add Holding (create an account first)
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Holding
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Holding</DialogTitle>
          </DialogHeader>
          <HoldingForm
            accounts={accounts}
            action={createHolding}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
