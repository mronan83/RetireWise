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

export function AddHoldingButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);

  const accounts = [
    { id: accountId, name: "", institution: "", clerkId: "" } as Account,
  ];

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
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
            defaultAccountId={accountId}
            action={createHolding}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
