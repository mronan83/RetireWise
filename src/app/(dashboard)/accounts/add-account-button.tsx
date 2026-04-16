"use client";

import { useState } from "react";
import { Plus, Link2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountForm } from "@/components/forms/account-form";
import { PlaidLinkButton } from "@/components/plaid/plaid-link-button";
import { createAccount } from "@/lib/actions/accounts";

export function AddAccountButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "manual">("choose");

  const handleClose = () => {
    setOpen(false);
    setMode("choose");
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Account
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          {mode === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Add an Account</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                How would you like to add your account?
              </p>
              <div className="space-y-3 mt-2">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Link2 className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">
                        Connect via Plaid
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Automatically import your accounts, holdings, and
                        transactions from Fidelity, Vanguard, Schwab, and
                        12,000+ other institutions.
                      </p>
                    </div>
                  </div>
                  <PlaidLinkButton />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      or
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => setMode("manual")}
                >
                  <PenLine className="h-5 w-5" />
                  <div className="text-left">
                    <p className="font-medium text-sm">Add manually</p>
                    <p className="text-xs text-muted-foreground font-normal">
                      Enter account details and holdings by hand, or import
                      from a CSV file.
                    </p>
                  </div>
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add Account Manually</DialogTitle>
              </DialogHeader>
              <AccountForm
                action={createAccount}
                onSuccess={handleClose}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("choose")}
                className="mt-2"
              >
                Back to options
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
