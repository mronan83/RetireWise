// Type export for chat panel — the actual agent is configured in /api/chat/route.ts
// so it can read the user's provider preference from the database at request time.

export type PortfolioAnalystUIMessage = import("@ai-sdk/react").UIMessage;
