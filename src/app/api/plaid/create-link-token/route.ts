import { auth } from "@clerk/nextjs/server";
import { CountryCode, Products } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getPlaidClient();

  const response = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "RetireWise",
    products: [Products.Investments],
    country_codes: [CountryCode.Us],
    language: "en",
  });

  return Response.json({ link_token: response.data.link_token });
}
