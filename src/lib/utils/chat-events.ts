// Simple event emitter for triggering AI chat from anywhere in the app

type ChatListener = (prompt: string) => void;

let listener: ChatListener | null = null;

export function onChatRequest(fn: ChatListener) {
  listener = fn;
  return () => {
    listener = null;
  };
}

export function triggerChat(prompt: string) {
  listener?.(prompt);
}
