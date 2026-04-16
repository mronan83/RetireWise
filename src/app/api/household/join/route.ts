import { joinHousehold } from "@/lib/household";

export async function POST(request: Request) {
  try {
    const { inviteCode } = await request.json();
    const success = await joinHousehold(inviteCode);
    if (!success) {
      return Response.json({ error: "Invalid invite code" }, { status: 400 });
    }
    return Response.json({ success: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
