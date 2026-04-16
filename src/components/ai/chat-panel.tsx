"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { MessageSquare, Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AI_DISCLAIMER } from "@/lib/constants";
import type { PortfolioAnalystUIMessage } from "@/lib/agents/portfolio-analyst";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error } =
    useChat<PortfolioAnalystUIMessage>({ transport });

  const isActive = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isActive) return;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-6 w-6" />
        <span className="sr-only">Open AI Chat</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              RetireWise AI
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4">
            <div className="space-y-4 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bot className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="font-semibold">Portfolio AI Assistant</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Ask me about your portfolio, allocation, performance, or get
                    rebalancing suggestions.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "Analyze my portfolio",
                      "Show allocation drift",
                      "What are my top holdings?",
                      "How diversified am I?",
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          sendMessage({ text: suggestion });
                        }}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <div
                            key={i}
                            className="whitespace-pre-wrap leading-relaxed"
                          >
                            {part.text}
                          </div>
                        );
                      }
                      if (isToolUIPart(part)) {
                        if (
                          part.state === "input-available" ||
                          part.state === "input-streaming"
                        ) {
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Analyzing...
                            </div>
                          );
                        }
                        if (part.state === "output-available") {
                          return (
                            <div key={i} className="py-1">
                              <Badge variant="secondary" className="text-xs">
                                Analysis complete
                              </Badge>
                            </div>
                          );
                        }
                      }
                      return null;
                    })}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isActive && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-3">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  Error: {error.message}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <p className="mb-2 text-[10px] text-muted-foreground">
              {AI_DISCLAIMER}
            </p>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your portfolio..."
                className="min-h-[44px] max-h-[120px] resize-none"
                rows={1}
              />
              <Button type="submit" size="icon" disabled={isActive || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
