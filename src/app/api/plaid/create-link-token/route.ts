import { and, eq } from "drizzle-orm";
import { getApiUserId, withApiHousehold } from "@/lib/auth-helpers";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { guardFeature, guardLimit } from "@/lib/billing/entitlements";
import { CountryCode, Products } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";

export async function POST(request: Request) {
  return withApiHousehold(() => handlePost(request));
}

async function handlePost(request: Request) {
  // The Plaid user is the household, matching what exchange-token keys items by.
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = await guardFeature(userId, "plaid_linking");
  if (denied) return denied;

  // Linked institutions are a plan limit — unlimited on the free tier, so this
  // is a no-op today that is nonetheless exercised on every link attempt.
  const linked = await getDb()
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(and(eq(plaidItems.clerkId, userId), eq(plaidItems.status, "active")));
  const overLimit = await guardLimit(userId, "linkedInstitutions", linked.length);
  if (overLimit) return overLimit;

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

  // Liabilities covers credit cards, student loans and mortgages — not
  // depository accounts. Requesting it for a savings account meant Link had
  // nothing to offer and refused the connection outright ("there are no
  // liability accounts to add"), because Plaid only offers institutions that
  // support *every* product in `products`.
  //
  // Transactions is the product that initializes a depository item. Balance
  // is not listed because Plaid does not accept it as a product — it comes
  // with any initialized item, and the balance is all this app reads.
  // Liabilities moves to `required_if_supported_products`, which fetches it
  // from a mortgage lender that offers it without hiding a bank that does not.
  const products =
    scope === "banking" ? [Products.Transactions] : [Products.Investments];
  const requiredIfSupported =
    scope === "banking" ? [Products.Liabilities] : undefined;

  try {
    const client = getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "RetireWise",
      products,
      ...(requiredIfSupported
        ? { required_if_supported_products: requiredIfSupported }
        : {}),
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return Response.json({ link_token: response.data.link_token });
  } catch (e: unknown) {
    // Plaid puts the useful text in the response body, not the Error message,
    // which otherwise surfaces as a bare "Request failed with status code 400".
    // The common cause here is a product that is not enabled on the Plaid
    // account, and that is worth saying out loud rather than making someone
    // read the server log to find out.
    const plaid = (e as { response?: { data?: { error_code?: string; error_message?: string } } })
      ?.response?.data;
    const message =
      plaid?.error_message ??
      (e instanceof Error ? e.message : "Unknown error");
    const hint =
      plaid?.error_code === "INVALID_PRODUCT" ||
      plaid?.error_code === "PRODUCTS_NOT_SUPPORTED"
        ? ` Enable the "${products.join(", ")}" product for this Plaid account, then try again.`
        : "";

    console.error("Plaid linkTokenCreate error:", plaid ?? e);
    return Response.json({ error: message + hint }, { status: 500 });
  }
}
