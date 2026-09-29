"use client";

import { useState, useCallback, useEffect } from "react";
import { usePlaidLink, type PlaidLinkOnExit } from "react-plaid-link";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlaidLinkButton({
  scope = "investments",
  label = "Connect Account",
}: {
  /** Which kind of connection this is — Plaid shows a different set of
      institutions depending on the products requested. */
  scope?: "investments" | "banking";
  label?: string;
} = {}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch link token on mount
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
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
  }, [scope]);

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

  // Link reports a failed connection here and nowhere else. Ignoring it meant
  // the dialog just closed, leaving no trace of why a card would not link.
  // The session id is what Plaid's dashboard logs are searchable by.
  const onExit = useCallback<PlaidLinkOnExit>((err, metadata) => {
    setLoading(false);
    if (!err) return;
    console.error("Plaid Link exited with an error", {
      error_code: err.error_code,
      error_type: err.error_type,
      institution: metadata.institution,
      link_session_id: metadata.link_session_id,
      request_id: metadata.request_id,
    });
    const where = metadata.institution?.name ? `${metadata.institution.name}: ` : "";
    const what = err.display_message || err.error_message || "The connection did not complete.";
    setError(`${where}${what} (${err.error_code})`);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  return (
    <div>
      <Button
        onClick={() => {
          setError(null);
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
        {label}
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
