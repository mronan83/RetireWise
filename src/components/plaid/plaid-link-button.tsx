"use client";

import { useState, useCallback } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlaidLinkButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get link token from our API
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
      });
      const data = await res.json();

      if (!data.link_token) {
        setError("Failed to create link token. Check Plaid configuration.");
        setLoading(false);
        return;
      }

      // Load Plaid Link script dynamically
      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.onload = () => {
        const handler = (window as unknown as { Plaid: { create: (config: { token: string; onSuccess: (publicToken: string, metadata: { institution?: { name: string } }) => void; onExit: () => void }) => { open: () => void } } }).Plaid.create({
          token: data.link_token,
          onSuccess: async (publicToken: string, metadata: { institution?: { name: string } }) => {
            // Exchange token
            await fetch("/api/plaid/exchange-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                public_token: publicToken,
                institution: metadata.institution,
              }),
            });
            setLoading(false);
            window.location.reload();
          },
          onExit: () => {
            setLoading(false);
          },
        });
        handler.open();
      };
      document.head.appendChild(script);
    } catch (e) {
      setError("Failed to connect. Please try again.");
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <Button onClick={handleConnect} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="mr-2 h-4 w-4" />
        )}
        Connect Account via Plaid
      </Button>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
