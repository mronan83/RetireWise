import { getApiUserId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { getPlaidClient } from "@/lib/plaid/client";
import { encryptToken } from "@/lib/plaid/encryption";
import { getDb } from "@/lib/db";
import { plaidItems, accounts, holdings } from "@/lib/db/schema";

export async function POST(request: Request) {
  // Linked accounts belong to the household, not the individual login.
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { public_token, institution } = await request.json();
  const client = getPlaidClient();

  // Exchange public token for access token
  const exchangeResponse = await client.itemPublicTokenExchange({
    public_token,
  });

  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;

  // Encrypt and store
  const db = getDb();
  await db.insert(plaidItems).values({
    clerkId: userId,
    itemId,
    accessTokenEncrypted: encryptToken(accessToken),
    institutionName: institution?.name || "Unknown",
    status: "active",
    lastSync: new Date(),
  });

  // Fetch investment holdings
  try {
    const holdingsResponse = await client.investmentsHoldingsGet({
      access_token: accessToken,
    });

    const plaidAccounts = holdingsResponse.data.accounts;
    const plaidHoldings = holdingsResponse.data.holdings;
    const securities = holdingsResponse.data.securities;

    const securityMap = new Map(securities.map((s) => [s.security_id, s]));

    // Create accounts
    for (const pa of plaidAccounts) {
      const accountType = mapPlaidAccountType(pa.subtype || pa.type);
      const [account] = await db
        .insert(accounts)
        .values({
          clerkId: userId,
          name: pa.name || pa.official_name || "Plaid Account",
          institution: institution?.name || "Unknown",
          accountType,
          taxTreatment: inferTaxTreatment(accountType),
          plaidItemId: itemId,
          plaidAccountId: pa.account_id,
          dataSource: "plaid",
        })
        .returning({ id: accounts.id });

      // Insert holdings for this account
      const accountHoldings = plaidHoldings.filter(
        (h) => h.account_id === pa.account_id
      );

      for (const ph of accountHoldings) {
        const security = securityMap.get(ph.security_id);
        if (!security) continue;

        const ticker = security.ticker_symbol || "UNKNOWN";
        const name = security.name || ticker;
        const shares = ph.quantity;
        const currentPrice = ph.institution_price || 0;
        const costBasis = ph.cost_basis
          ? ph.cost_basis / (shares || 1)
          : currentPrice;

        await db.insert(holdings).values({
          accountId: account.id,
          ticker,
          name,
          assetClass: mapPlaidSecurityType(security.type),
          shares: String(shares),
          costBasisPerShare: String(costBasis),
          currentPrice: String(currentPrice),
          currentValue: String(shares * currentPrice),
          dataSource: "plaid",
          lastPriceUpdate: new Date(),
        });
      }
    }
  } catch (e) {
    console.error("Failed to sync holdings:", e);
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/holdings");

  return Response.json({ success: true });
}

function mapPlaidAccountType(
  subtype: string | null
): "401k" | "ira_traditional" | "ira_roth" | "brokerage" | "hsa" | "other" {
  switch (subtype) {
    case "401k":
      return "401k";
    case "ira":
      return "ira_traditional";
    case "roth":
    case "roth 401k":
      return "ira_roth";
    case "hsa":
      return "hsa";
    case "brokerage":
    case "individual":
    case "joint":
      return "brokerage";
    default:
      return "brokerage";
  }
}

function inferTaxTreatment(
  accountType: string
): "tax_deferred" | "tax_free" | "taxable" {
  switch (accountType) {
    case "401k":
    case "403b":
    case "ira_traditional":
    case "pension":
      return "tax_deferred";
    case "ira_roth":
    case "hsa":
      return "tax_free";
    default:
      return "taxable";
  }
}

function mapPlaidSecurityType(
  type: string | null
): "us_stock" | "bond" | "cash" | "other" {
  switch (type) {
    case "equity":
    case "etf":
    case "mutual fund":
      return "us_stock";
    case "fixed income":
      return "bond";
    case "cash":
      return "cash";
    default:
      return "other";
  }
}
