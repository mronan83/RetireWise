import { getApiUserId } from "@/lib/auth-helpers";
import { CountryCode, Products } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";

export async function POST(request: Request) {
  // The Plaid user is the household, matching what exchange-token keys items by.
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return Response.json(
      { error: "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to environment variables." },
      { status: 500 }
    );
  }

  // Plaid narrows the institution list to those supporting every product
  // requested, so asking for investments while connecting a bank would hide
  // the bank. The caller says which kind of connection this is.
  let scope: "investments" | "banking" = "investments";
  try {
    const body = await request.json();
    if (body?.scope === "banking") scope = "banking";
  } catch {
    // No body means the original investments flow.
  }

  const products =
    scope === "banking"
      ? [Products.Liabilities]
      : [Products.Investments];

  try {
    const client = getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "RetireWise",
      products,
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return Response.json({ link_token: response.data.link_token });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Plaid linkTokenCreate error:", e);
    return Response.json({ error: message }, { status: 500 });
  }
}
