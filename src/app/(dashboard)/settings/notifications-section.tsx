"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Kind = { key: string; label: string };
type State =
  | { status: "loading" }
  | { status: "unsupported"; reason: "browser" | "install" }
  | { status: "unconfigured" }
  | { status: "denied" }
  | { status: "ready"; publicKey: string; kinds: Kind[]; on: string[] | null; sub: PushSubscription | null };

/** The browser wants the application key as bytes, not as the URL-safe base64 it is given as. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Turn push notifications on for this device and choose what it receives.
 *
 * Each device is turned on separately, from a tap, because iOS refuses a
 * permission request that a person did not start. On an iPhone, web push
 * reaches only RetireWise added to the Home Screen.
 */
export function NotificationsSection() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches;
    if (!supported) {
      setState({ status: "unsupported", reason: ios && !installed ? "install" : "browser" });
      return;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    const q = sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : "";
    const res = await fetch(`/api/notifications${q}`);
    if (!res.ok) {
      setState({ status: "unconfigured" });
      return;
    }
    const data = (await res.json()) as { configured: boolean; publicKey: string | null; kinds: Kind[]; device: { kinds: string[] } | null };
    if (!data.configured || !data.publicKey) {
      setState({ status: "unconfigured" });
      return;
    }
    if (Notification.permission === "denied") {
      setState({ status: "denied" });
      return;
    }
    setState({ status: "ready", publicKey: data.publicKey, kinds: data.kinds, on: data.device?.kinds ?? null, sub });
  }, []);

  useEffect(() => {
    load().catch(() => setState({ status: "unsupported", reason: "browser" }));
  }, [load]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground">Checking this device…</p>;
  if (state.status === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        {state.reason === "install"
          ? "On iPhone and iPad, notifications reach RetireWise only once it is added to the Home Screen: tap Share, then Add to Home Screen, and open it from there (iOS 16.4 or later)."
          : "This browser cannot receive push notifications."}
      </p>
    );
  }
  if (state.status === "unconfigured") {
    return <p className="text-sm text-muted-foreground">Notifications are not set up for RetireWise yet.</p>;
  }
  if (state.status === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for RetireWise on this device. Allow them in the device&apos;s settings, then reopen this page.
      </p>
    );
  }

  const { publicKey, kinds, on, sub } = state;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const post = async (subscription: PushSubscription, chosen?: string[]) => {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), ...(chosen ? { kinds: chosen } : {}) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not save.");
    return data.kinds as string[];
  };

  const turnOn = () =>
    run(async () => {
      if ((await Notification.requestPermission()) !== "granted") {
        setState({ status: "denied" });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const fresh =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const saved = await post(fresh);
      setState({ ...state, on: saved, sub: fresh });
    });

  const turnOff = () =>
    run(async () => {
      if (sub) {
        await fetch("/api/notifications", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState({ ...state, on: null, sub: null });
    });

  const toggle = (key: string, value: boolean) =>
    run(async () => {
      if (!sub || !on) return;
      const next = value ? [...on, key] : on.filter((k) => k !== key);
      setState({ ...state, on: await post(sub, next) });
    });

  const test = () =>
    run(async () => {
      if (!sub) return;
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The test was not sent.");
      setNote("Sent. It should arrive in a few seconds.");
    });

  if (!on || !sub) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Get a notification on this device when something important happens: an account needs reconnecting, a
          critical alert, a goal reached, someone joins your household, money leaves an account, or a yearly
          deadline is near. Notifications never show an amount.
        </p>
        <Button onClick={turnOn} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
          Turn on notifications on this device
        </Button>
        {note && <p className="text-sm text-destructive">{note}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {kinds.map((k) => (
          <li key={k.key} className="flex items-center justify-between gap-4">
            <label htmlFor={`notify-${k.key}`} className="text-sm">
              {k.label}
            </label>
            <Switch
              id={`notify-${k.key}`}
              checked={on.includes(k.key)}
              onCheckedChange={(v) => toggle(k.key, v)}
              disabled={busy}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={test} disabled={busy}>
          Send a test
        </Button>
        <Button variant="ghost" onClick={turnOff} disabled={busy}>
          Turn off on this device
        </Button>
      </div>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
