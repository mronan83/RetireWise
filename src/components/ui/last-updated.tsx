import { AlertTriangle, CircleHelp, Clock, Link2Off, RefreshCw } from "lucide-react";
import {
  absoluteTimestamp,
  freshnessOf,
  relativeAge,
  type Freshness,
  type FreshnessKind,
} from "@/lib/utils/freshness";
import { cn } from "@/lib/utils";

const TONE: Record<Freshness, string> = {
  fresh: "text-muted-foreground",
  aging: "text-amber-600 dark:text-amber-500",
  stale: "text-destructive",
  unknown: "text-muted-foreground",
};

/**
 * When a figure was last updated.
 *
 * Colour carries the same information as the words rather than replacing
 * them — "8 months ago" reads as old whether or not the reader can see the
 * amber. The exact timestamp goes in the title attribute, because that is
 * the level of precision people want only when they go looking for it.
 */
export function LastUpdated({
  at,
  kind,
  label,
  className,
  showIcon = true,
}: {
  at: Date | string | null | undefined;
  kind: FreshnessKind;
  /** Prefix, e.g. "Prices" → "Prices 2 hours ago". */
  label?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const state = freshnessOf(at, kind);
  const Icon = state === "unknown" ? CircleHelp : state === "stale" ? AlertTriangle : Clock;

  return (
    <span
      title={absoluteTimestamp(at)}
      className={cn("inline-flex items-center gap-1 text-xs", TONE[state], className)}
    >
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      {label && <span>{label}</span>}
      <span>{relativeAge(at)}</span>
    </span>
  );
}

export type ConnectionState = {
  /** Null for an account nobody linked — not a failure, just a different thing. */
  linked: boolean;
  lastSync: Date | string | null;
  status?: string | null;
  consecutiveFailures?: number;
  institution?: string | null;
};

/**
 * The health of an institution link, which is a different question from the
 * age of the numbers it produced.
 *
 * They come apart in both directions: a connection can be syncing happily
 * while a price feed behind it has not moved in a week, and a connection can
 * be broken for days while the last balance it fetched still looks current.
 */
export function ConnectionStatus({
  connection,
  className,
}: {
  connection: ConnectionState;
  className?: string;
}) {
  if (!connection.linked) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
        title="Entered by hand. Nothing updates this on its own."
      >
        <Link2Off className="h-3 w-3 shrink-0" />
        Manual entry
      </span>
    );
  }

  if (connection.status === "requires_reauth") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-destructive", className)}>
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Reconnect needed — not updating
      </span>
    );
  }

  const failing = (connection.consecutiveFailures ?? 0) > 0;
  const state = freshnessOf(connection.lastSync, "connection");

  return (
    <span
      title={`Last successful sync: ${absoluteTimestamp(connection.lastSync)}`}
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        failing || state === "stale"
          ? "text-destructive"
          : state === "aging"
            ? "text-amber-600 dark:text-amber-500"
            : "text-muted-foreground",
        className
      )}
    >
      <RefreshCw className="h-3 w-3 shrink-0" />
      {failing ? (
        <>
          Retrying &middot; last synced {relativeAge(connection.lastSync)}
        </>
      ) : (
        <>Synced {relativeAge(connection.lastSync)}</>
      )}
    </span>
  );
}
