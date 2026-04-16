"use client";

import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlaidLinkButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch link token on mount
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setLinkToken(data.link_token);
        }
      } catch {
        setError("Failed to initialize Plaid. Check your connection.");
      }
    }
    fetchToken();
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name: string } | null }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          window.location.reload();
        }
      } catch {
        setError("Failed to connect account. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLoading(false),
  });

  return (
    <div>
      <Button
        onClick={() => {
          setLoading(true);
          open();
        }}
        disabled={!ready || loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="mr-2 h-4 w-4" />
        )}
        Connect Account via Plaid
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {!linkToken && !error && (
        <p className="mt-2 text-xs text-muted-foreground">
          Initializing Plaid...
        </p>
      )}
    </div>
  );
}
