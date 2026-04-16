import { createAgentUIStreamResponse } from "ai";
import { auth } from "@clerk/nextjs/server";
import { portfolioAnalyst } from "@/lib/agents/portfolio-analyst";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: portfolioAnalyst,
    uiMessages: messages,
  });
}
