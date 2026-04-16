import { createHousehold } from "@/lib/household";

export async function POST() {
  try {
    const result = await createHousehold();
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
