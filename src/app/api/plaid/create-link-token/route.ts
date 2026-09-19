import { getApiUserId } from "@/lib/auth-helpers";
import { CountryCode, Products } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";

export async function POST() {
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

  try {
    const client = getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "RetireWise",
      products: [Products.Investments],
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
