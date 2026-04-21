"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, Eye, EyeOff, Trash2, Key } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const providers = [
  {
    id: "anthropic",
    name: "Claude Sonnet 4.5",
    company: "Anthropic",
    description: "Best for nuanced financial analysis and reasoning",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-api03-...",
  },
  {
    id: "google",
    name: "Gemini 2.0 Flash",
    company: "Google",
    description: "Fast and cost-effective, free tier available",
    keyPrefix: "",
    keyPlaceholder: "AIza...",
  },
  {
    id: "openai",
    name: "GPT-4.1",
    company: "OpenAI",
    description: "Strong general-purpose model",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-proj-...",
  },
];

type KeyInfo = {
  configured: boolean;
  masked: string | null;
  source: "user" | "server" | "none";
};

type Props = {
  currentProvider: string;
};

export function AiProviderSection({ currentProvider }: Props) {
  const [selected, setSelected] = useState(currentProvider);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keys, setKeys] = useState<Record<string, KeyInfo>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Fetch current key status on mount
  useEffect(() => {
    fetch("/api/settings/ai-provider")
      .then((r) => r.json())
      .then((data) => {
        if (data.keys) setKeys(data.keys);
        if (data.provider) setSelected(data.provider);
      })
      .catch(() => {});
  }, []);

  const handleSelect = async (providerId: string) => {
    if (providerId === selected) return;
    const keyInfo = keys[providerId];
    if (!keyInfo?.configured) return; // can't select without a key
    setSelected(providerId);
    setSaving(true);
    setSaved(false);

    try {
      await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSelected(currentProvider);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async (providerId: string) => {
    if (!keyInput.trim()) return;
    setKeyError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey: keyInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");

      // Refresh key status
      const data = await fetch("/api/settings/ai-provider").then((r) => r.json());
      if (data.keys) setKeys(data.keys);

      setEditingKey(null);
      setKeyInput("");
      setShowKey(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setKeyError("Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async (providerId: string) => {
    setSaving(true);
    try {
      await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeKey: providerId }),
      });
      const data = await fetch("/api/settings/ai-provider").then((r) => r.json());
      if (data.keys) setKeys(data.keys);
      // If removing the active provider's key, it may still work via server env var
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = (providerId: string) => keys[providerId]?.configured ?? false;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose which AI model powers your portfolio analysis. Add your own API key for any provider,
        or use the server default if available.
      </p>

      <div className="grid gap-3">
        {providers.map((p) => {
          const keyInfo = keys[p.id];
          const configured = isConfigured(p.id);
          const isEditing = editingKey === p.id;

          return (
            <div key={p.id} className="space-y-2">
              {/* Provider selection button */}
              <button
                onClick={() => configured && handleSelect(p.id)}
                disabled={!configured || saving}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-4 text-left transition-colors w-full",
                  selected === p.id
                    ? "border-primary bg-primary/5"
                    : configured
                      ? "hover:bg-accent/50"
                      : "opacity-60"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.company}</span>
                    {keyInfo?.source === "user" && (
                      <Badge variant="outline" className="text-[10px]">
                        <Key className="h-2.5 w-2.5 mr-0.5" />
                        Your key
                      </Badge>
                    )}
                    {keyInfo?.source === "server" && (
                      <Badge variant="secondary" className="text-[10px]">Server key</Badge>
                    )}
                    {!configured && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">No key</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  {keyInfo?.masked && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{keyInfo.masked}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {selected === p.id && <Check className="h-5 w-5 text-primary" />}
                </div>
              </button>

              {/* API key management row */}
              <div className="flex items-center gap-2 pl-4">
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={p.keyPlaceholder}
                        className="h-8 text-xs font-mono pr-8"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleSaveKey(p.id)}
                      disabled={!keyInput.trim() || saving}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => { setEditingKey(null); setKeyInput(""); setKeyError(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => { setEditingKey(p.id); setKeyInput(""); setKeyError(null); setShowKey(false); }}
                    >
                      <Key className="h-3 w-3 mr-1" />
                      {keyInfo?.source === "user" ? "Change key" : "Add key"}
                    </Button>
                    {keyInfo?.source === "user" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => handleRemoveKey(p.id)}
                        disabled={saving}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {keyError && isEditing && (
                <p className="text-xs text-red-500 pl-4">{keyError}</p>
              )}
            </div>
          );
        })}
      </div>

      {saving && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </p>
      )}
      {saved && (
        <p className="text-xs text-green-500">
          Saved. New chats will use this configuration.
        </p>
      )}

      <p className="text-[10px] text-muted-foreground">
        API keys are encrypted before storage and never sent back to the browser. If a server-wide key is configured
        by the admin, it will be used as a fallback when no personal key is set.
      </p>
    </div>
  );
}
