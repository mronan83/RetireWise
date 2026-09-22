import { expect, test } from "@playwright/test";
import { enterDemoMode } from "./helpers";

/**
 * Uploading a credit card statement.
 *
 * The importer already accepted .ofx files and already recognised this one as
 * OFX. It then ran it through the holdings reader, which looks for
 * `<INVPOSLIST>`, found nothing, and reported "No holdings found in the file.
 * Check the format" — a correct file blamed for a gap in the reader, with no
 * way for the owner to tell the difference.
 *
 * The parser has its own unit tests. What those cannot show is whether any of
 * it is reachable from the upload control, which is exactly how the
 * secured-debt picker shipped invisible: component, action and composer all
 * correct, and no screen that rendered them. So this drives the real input.
 */

const APPLE_CARD_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>
<DTSERVER>20260920120000<LANGUAGE>ENG
<FI><ORG>Goldman Sachs Bank USA<FID>1234</FI>
</SONRS></SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>XXXXXXXXXXXX1234</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-84.21<FITID>AC1<NAME>WHOLE FOODS MKT</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>500.00<FITID>AC2<NAME>ACH PAYMENT THANK YOU</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-1843.77<DTASOF>20260920120000</LEDGERBAL>
<AVAILBAL><BALAMT>8156.23<DTASOF>20260920120000</AVAILBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

const CHECKING_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>First National<FID>9</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD
<BANKACCTFROM><ACCTID>000123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<LEDGERBAL><BALAMT>4200.10<DTASOF>20260920</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

async function upload(
  page: import("@playwright/test").Page,
  name: string,
  contents: string
) {
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: "application/x-ofx",
    buffer: Buffer.from(contents, "utf8"),
  });
}

test.describe("importing a statement balance", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoMode(page);
    await page.goto("/import");
  });

  test("a credit card statement is read as a debt, not rejected as holdings", async ({
    page,
  }) => {
    await upload(page, "apple-card.ofx", APPLE_CARD_OFX);

    const card = page.getByTestId("statement-card");
    await expect(
      card,
      "the upload produced no statement panel — a card statement is reaching " +
        "the holdings reader again, which cannot read one"
    ).toBeVisible({ timeout: 15_000 });

    // The exact message the owner used to get for a perfectly good file.
    await expect(page.getByText("No holdings found in the file")).toHaveCount(0);

    await expect(card).toHaveAttribute("data-kind", "credit_card");
    await expect(card).toHaveAttribute("data-target", "debt");

    // The sign is the whole point: the file says -1843.77 and the household
    // owes 1,843.77. A card shown as -$1,843.77 of debt, or filed as cash,
    // moves net worth by twice the balance.
    await expect(page.getByTestId("statement-balance")).toHaveText("$1,843.77");

    // The routing has to be checkable, not merely correct.
    await expect(page.getByText("CCSTMTRS")).toBeVisible();
  });

  test("the balance can be flipped when the issuer writes it the other way", async ({
    page,
  }) => {
    await upload(page, "apple-card.ofx", APPLE_CARD_OFX);
    const balance = page.getByTestId("statement-balance");
    await expect(balance).toHaveText("$1,843.77");

    await page.getByTestId("flip-sign").click();
    await expect(
      balance,
      "the escape hatch for an issuer using the opposite convention does nothing"
    ).toHaveText("-$1,843.77");
  });

  test("a checking statement is read as cash, on its own ACCTTYPE", async ({ page }) => {
    await upload(page, "checking.ofx", CHECKING_OFX);

    const card = page.getByTestId("statement-card");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveAttribute("data-kind", "checking");
    await expect(card).toHaveAttribute("data-target", "cash");
    // Not inverted — a deposit account is not a card.
    await expect(page.getByTestId("statement-balance")).toHaveText("$4,200.10");
  });

  test("the statement can be applied to an account that already exists", async ({
    page,
  }) => {
    await upload(page, "apple-card.ofx", APPLE_CARD_OFX);
    await expect(page.getByTestId("statement-card")).toBeVisible({ timeout: 15_000 });

    // Without this the only outcome is a second copy of an account the
    // household already tracks, which is how a balance gets counted twice.
    await expect(
      page.getByTestId("statement-existing"),
      "there is no way to point the upload at an existing debt"
    ).toBeVisible();
  });
});
