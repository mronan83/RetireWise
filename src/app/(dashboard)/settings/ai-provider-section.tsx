"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const providers = [
  {
    id: "anthropic",
    name: "Claude Sonnet 4.5",
    company: "Anthropic",
    description: "Best for nuanced financial analysis and reasoning",
    configured: true,
  },
  {
    id: "google",
    name: "Gemini 2.0 Flash",
    company: "Google",
    description: "Fast and cost-effective, free tier available",
    configured: true,
  },
  {
    id: "openai",
    name: "GPT-4.1",
    company: "OpenAI",
    description: "Strong general-purpose model",
    configured: false,
  },
];

type Props = {
  currentProvider: string;
};

export function AiProviderSection({ currentProvider }: Props) {
  const [selected, setSelected] = useState(currentProvider);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSelect = async (providerId: string) => {
    if (providerId === selected) return;
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
      setSelected(currentProvider); // revert on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose which AI model powers your portfolio analysis. You can switch
        anytime.
      </p>

      <div className="grid gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => p.configured && handleSelect(p.id)}
            disabled={!p.configured || saving}
            className={cn(
              "flex items-center justify-between rounded-lg border p-4 text-left transition-colors",
              selected === p.id
                ? "border-primary bg-primary/5"
                : p.configured
                  ? "hover:bg-accent/50"
                  : "opacity-50 cursor-not-allowed"
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.company}
                </span>
                {!p.configured && (
                  <span className="text-xs text-muted-foreground italic">
                    (no key configured)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {p.description}
              </p>
            </div>
            {selected === p.id && (
              <Check className="h-5 w-5 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>

      {saving && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Switching provider...
        </p>
      )}
      {saved && (
        <p className="text-xs text-green-500">
          Provider updated. New chats will use this model.
        </p>
      )}
    </div>
  );
}
