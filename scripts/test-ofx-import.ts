/**
 * OFX/QFX statements that are not investment accounts.
 *
 * The importer recognised an Apple Card statement as OFX, found no positions
 * in it, and reported "No holdings found in the file. Check the format" — a
 * correct file blamed for a gap in the reader.
 *
 * The assertions below are written as that failure, and as the one waiting
 * behind it: a credit card's balance is negative when money is owed, and
 * `debts.current_balance` is positive when money is owed. The obvious bridge
 * between them, Math.abs(), turns an overpaid card into a debt of the same
 * size without saying anything.
 */
import {
  isOfx,
  parseOfxStatements,
  parseAmount,
  parseOfxDate,
  interpretOwedBalance,
  suggestDebtType,
  suggestCashType,
  suggestName,
  type OfxTransaction,
} from "../src/lib/import/ofx";
import { parseQFX, isQFXFormat } from "../src/lib/utils/csv-parser";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEADER = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>
<DTSERVER>20260920120000<LANGUAGE>ENG
<FI><ORG>Goldman Sachs Bank USA<FID>1234</FI>
</SONRS></SIGNONMSGSRSV1>`;

/** The usual convention: purchases negative, payments positive, owed negative. */
const APPLE_CARD = `${HEADER}
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>XXXXXXXXXXXX1234</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-84.21<FITID>AC0001<NAME>WHOLE FOODS MKT</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>500.00<FITID>AC0002<NAME>ACH PAYMENT THANK YOU</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260915<TRNAMT>-212.55<FITID>AC0003<NAME>APPLE.COM/BILL</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-1843.77<DTASOF>20260920120000</LEDGERBAL>
<AVAILBAL><BALAMT>8156.23<DTASOF>20260920120000</AVAILBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

/** The other convention, which also ships: purchases positive, owed positive. */
const INVERTED_CARD = `${HEADER}
<CREDITCARDMSGSRSV1><CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>500000000000 9876</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>84.21<FITID>B1<NAME>GROCERY</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>-500.00<FITID>B2<NAME>PAYMENT - THANK YOU</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1843.77<DTASOF>20260920</LEDGERBAL>
</CCSTMTRS></CREDITCARDMSGSRSV1>
</OFX>`;

/** An overpaid card. The balance is real and is not a debt. */
const OVERPAID_CARD = `${HEADER}
<CREDITCARDMSGSRSV1><CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>XXXXXXXXXXXX4321</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-40.00<FITID>C1<NAME>COFFEE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905<TRNAMT>500.00<FITID>C2<NAME>PAYMENT THANK YOU</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>120.50<DTASOF>20260920</LEDGERBAL>
</CCSTMTRS></CREDITCARDMSGSRSV1>
</OFX>`;

/** No transactions at all — nothing in the file settles the sign. */
const BARE_CARD = `${HEADER}
<CREDITCARDMSGSRSV1><CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>XXXXXXXXXXXX5555</CCACCTFROM>
<LEDGERBAL><BALAMT>-500.00<DTASOF>20260920</LEDGERBAL>
</CCSTMTRS></CREDITCARDMSGSRSV1>
</OFX>`;

const CHECKING = `${HEADER}
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>USD
<BANKACCTFROM><BANKID>021000021<ACCTID>000123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-1200.00<FITID>D1<NAME>MORTGAGE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4200.10<DTASOF>20260920</LEDGERBAL>
<AVAILBAL><BALAMT>4100.10<DTASOF>20260920</AVAILBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const CREDIT_LINE = `${HEADER}
<BANKMSGSRSV1><STMTRS><CURDEF>USD
<BANKACCTFROM><ACCTID>77770000<ACCTTYPE>CREDITLINE</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902<TRNAMT>-2000.00<FITID>E1<NAME>DRAW</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-15000.00<DTASOF>20260920</LEDGERBAL>
</STMTRS></BANKMSGSRSV1>
</OFX>`;

/** One file, two accounts. Issuers do this. */
const MULTI = `${HEADER}
<BANKMSGSRSV1><STMTRS><CURDEF>USD
<BANKACCTFROM><ACCTID>111122223333<ACCTTYPE>SAVINGS</BANKACCTFROM>
<LEDGERBAL><BALAMT>25000.00<DTASOF>20260920</LEDGERBAL>
</STMTRS></BANKMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>444455556666</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260820<DTEND>20260920
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-10.00<FITID>F1<NAME>SHOP</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-900.00<DTASOF>20260920</LEDGERBAL>
</CCSTMTRS></CREDITCARDMSGSRSV1>
</OFX>`;

/** OFX 2.x is real XML, with every element closed. */
const XML_CARD = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE"?>
<OFX>
  <SIGNONMSGSRSV1><SONRS><FI><ORG>Chase</ORG><FID>10898</FID></FI></SONRS></SIGNONMSGSRSV1>
  <CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
    <CURDEF>USD</CURDEF>
    <CCACCTFROM><ACCTID>4147202299887766</ACCTID></CCACCTFROM>
    <BANKTRANLIST>
      <DTSTART>20260801</DTSTART><DTEND>20260831</DTEND>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260805</DTPOSTED><TRNAMT>-55.40</TRNAMT><FITID>X1</FITID><NAME>HARDWARE STORE</NAME></STMTTRN>
    </BANKTRANLIST>
    <LEDGERBAL><BALAMT>-2210.00</BALAMT><DTASOF>20260831</DTASOF></LEDGERBAL>
  </CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

const INVESTMENT = `${HEADER}
<INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><DTASOF>20260920120000<CURDEF>USD
<INVACCTFROM><BROKERID>schwab.com<ACCTID>98765432</INVACCTFROM>
<INVPOSLIST>
<POSSTOCK><INVPOS><SECID><UNIQUEID>922908769<UNIQUEIDTYPE>CUSIP</SECID>
<HELDINACCT>CASH<POSTYPE>LONG<UNITS>100<UNITPRICE>250.00<MKTVAL>25000.00</INVPOS></POSSTOCK>
</INVPOSLIST>
</INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1>
<SECLISTMSGSRSV1><SECLIST>
<STOCKINFO><SECINFO><SECID><UNIQUEID>922908769<UNIQUEIDTYPE>CUSIP</SECID>
<SECNAME>Vanguard Total Stock Market ETF<TICKER>VTI</SECINFO></STOCKINFO>
</SECLIST></SECLISTMSGSRSV1>
</OFX>`;

const txn = (amount: number, type: string, description: string): OfxTransaction => ({
  id: null, date: "2026-09-01", amount, type, description,
});

function main() {
  // ---- the reported failure, reproduced ----------------------------------
  check(
    "an Apple Card statement was already recognised as OFX",
    isQFXFormat(APPLE_CARD) && isOfx(APPLE_CARD),
    "which is why the file got as far as a misleading error"
  );
  check(
    "the holdings reader finds nothing in it, as it must",
    parseQFX(APPLE_CARD).length === 0,
    "a card statement has no INVPOSLIST — the bug was routing it there at all"
  );

  // ---- it is now read -----------------------------------------------------
  const apple = parseOfxStatements(APPLE_CARD);
  check("the card statement parses", apple.problem === null && apple.statements.length === 1,
    apple.problem ?? `${apple.statements.length} statements`);

  const card = apple.statements[0];
  check("it is filed as a credit card, on the file's own say-so",
    card.kind === "credit_card" && card.target === "debt",
    `${card.kind} / ${card.target}`);
  check("and it can show which marker decided that",
    card.kindFrom.includes("CCSTMTRS"), card.kindFrom);
  check("the balance owed is 1,843.77, not -1,843.77",
    card.balance !== null && near(card.balance.value, 1843.77),
    String(card.balance?.value));
  check("the figure as written is kept alongside it",
    card.balance !== null && near(card.balance.raw, -1843.77),
    String(card.balance?.raw));
  check("and the sign was settled by evidence, not assumed",
    card.balance?.confidence === "derived", card.balance?.convention);
  check("the as-of date comes through, because a statement balance is not today's",
    card.balance?.asOf === "2026-09-20", String(card.balance?.asOf));
  check("available credit is read", near(card.available ?? 0, 8156.23), String(card.available));
  check("all three transactions are read", card.transactions.length === 3,
    String(card.transactions.length));
  check("only the last four of the account number is kept",
    card.accountTail === "1234", String(card.accountTail));
  check("the full account number is nowhere in the result",
    !JSON.stringify(card).includes("XXXXXXXXXXXX1234"));
  check("the statement period is read", card.periodStart === "2026-08-20" && card.periodEnd === "2026-09-20",
    `${card.periodStart}..${card.periodEnd}`);

  // ---- the other convention ----------------------------------------------
  const inverted = parseOfxStatements(INVERTED_CARD).statements[0];
  check("an issuer writing purchases positive is read the other way round",
    inverted.balance !== null && near(inverted.balance.value, 1843.77) && near(inverted.balance.raw, 1843.77),
    `${inverted.balance?.raw} → ${inverted.balance?.value}`);
  check("and that reading is also derived from the file, not assumed",
    inverted.balance?.confidence === "derived", inverted.balance?.convention);

  // ---- the case Math.abs() destroys ---------------------------------------
  // Purchases are negative here, so a POSITIVE balance means the card is
  // overpaid. Math.abs() would file $120.50 the household is owed as $120.50
  // it owes: a $241 error, in the direction that flatters nobody.
  const overpaid = parseOfxStatements(OVERPAID_CARD).statements[0];
  check("an overpaid card is reported as a credit balance, not a debt",
    overpaid.balance !== null && near(overpaid.balance.value, -120.5),
    String(overpaid.balance?.value));
  check("which is exactly what Math.abs() would have got wrong",
    Math.abs(overpaid.balance!.raw) !== overpaid.balance!.value,
    "abs() gives 120.50 owed; the household is owed 120.50"
  );

  // ---- no evidence: say so rather than sound certain ----------------------
  const bare = parseOfxStatements(BARE_CARD).statements[0];
  check("a card with no transactions still yields a balance",
    bare.balance !== null && near(bare.balance.value, 500), String(bare.balance?.value));
  check("but the reading is marked assumed, so a screen must confirm it",
    bare.balance?.confidence === "assumed", bare.balance?.convention);

  // ---- bank accounts name themselves --------------------------------------
  const checking = parseOfxStatements(CHECKING).statements[0];
  check("a checking statement is filed as cash",
    checking.kind === "checking" && checking.target === "cash", checking.kind);
  check("its balance is not inverted — a deposit account is not a card",
    checking.balance !== null && near(checking.balance.value, 4200.1) && checking.balance.confidence === "stated",
    String(checking.balance?.value));
  check("and the ACCTTYPE that decided it is quoted",
    checking.kindFrom.includes("CHECKING"), checking.kindFrom);

  const creditLine = parseOfxStatements(CREDIT_LINE).statements[0];
  check("a CREDITLINE is a debt, not a cash account",
    creditLine.kind === "line_of_credit" && creditLine.target === "debt", creditLine.kind);
  check("and its balance is inverted like a card's",
    creditLine.balance !== null && near(creditLine.balance.value, 15000), String(creditLine.balance?.value));

  // ---- several accounts in one file ---------------------------------------
  const multi = parseOfxStatements(MULTI);
  check("a file holding two accounts yields two statements", multi.statements.length === 2,
    String(multi.statements.length));
  check("each routed on its own marker",
    multi.statements.some((s) => s.kind === "savings" && s.target === "cash") &&
      multi.statements.some((s) => s.kind === "credit_card" && s.target === "debt"),
    multi.statements.map((s) => s.kind).join(", "));
  check("the savings balance stands as written",
    near(multi.statements.find((s) => s.kind === "savings")!.balance!.value, 25000));
  check("the card balance is flipped to what is owed",
    near(multi.statements.find((s) => s.kind === "credit_card")!.balance!.value, 900));

  // ---- OFX 2.x is XML, and must read the same -----------------------------
  const xml = parseOfxStatements(XML_CARD);
  check("an OFX 2.x XML file parses too", xml.statements.length === 1, xml.problem ?? "");
  check("with the same balance handling",
    xml.statements[0]?.balance !== null && near(xml.statements[0].balance!.value, 2210),
    String(xml.statements[0]?.balance?.value));
  check("and the institution from its FI block", xml.statements[0]?.institution === "Chase",
    String(xml.statements[0]?.institution));

  // ---- investments keep going to the holdings importer --------------------
  const inv = parseOfxStatements(INVESTMENT);
  check("an investment statement is recognised and routed away from balances",
    inv.statements.length === 1 && inv.statements[0].target === "investment",
    inv.statements.map((s) => s.target).join(","));
  check("and the existing holdings reader still reads it, unchanged",
    parseQFX(INVESTMENT).length === 1 && parseQFX(INVESTMENT)[0].ticker === "VTI",
    JSON.stringify(parseQFX(INVESTMENT).map((h) => h.ticker))
  );

  // ---- amounts and dates ---------------------------------------------------
  check("a thousands comma is not a decimal point", near(parseAmount("1,234.56")!, 1234.56));
  check("a decimal comma is", near(parseAmount("1234,56")!, 1234.56));
  check("and so is one with thousands dots", near(parseAmount("1.234,56")!, 1234.56));
  check("a negative amount survives", near(parseAmount("-1,843.77")!, -1843.77));
  check("an empty amount is null, not zero", parseAmount("") === null,
    "zero is a balance; missing is not");
  check("a timestamped OFX date reduces to a day", parseOfxDate("20260920120000.000[-5:EST]") === "2026-09-20");
  check("a bare OFX date too", parseOfxDate("20260920") === "2026-09-20");
  check("nonsense is null, not an epoch date", parseOfxDate("not a date") === null);
  check("an impossible month is rejected", parseOfxDate("20261320") === null);

  // ---- the sign rule, directly --------------------------------------------
  check("purchases alone settle the convention",
    interpretOwedBalance(-100, [txn(-25, "DEBIT", "STORE")]).value === 100);
  check("payments alone do not overrule the absence of purchases",
    interpretOwedBalance(-100, [txn(50, "CREDIT", "PAYMENT THANK YOU")]).confidence === "assumed",
    "a lone payment is consistent with either convention");
  check("a zero balance stays zero, either way",
    interpretOwedBalance(0, [txn(-25, "DEBIT", "STORE")]).value === 0);

  // ---- what to call it -----------------------------------------------------
  check("a card is suggested as a credit card debt", suggestDebtType("credit_card") === "credit_card");
  check("a line of credit is not called a credit card", suggestDebtType("line_of_credit") === "personal_loan");
  check("a money market account maps to its own cash type", suggestCashType("money_market") === "money_market");
  check("a name is built from the institution and the last four",
    suggestName(card) === "Goldman Sachs Bank USA ····1234", suggestName(card));

  // ---- files that are not what they claim ---------------------------------
  const notOfx = parseOfxStatements("Date,Description,Amount\n2026-09-01,COFFEE,-4.50");
  check("a CSV is refused with a reason that names the format",
    notOfx.statements.length === 0 && /not OFX/i.test(notOfx.problem ?? ""), notOfx.problem ?? "");
  const emptyOfx = parseOfxStatements(`${HEADER}\n</OFX>`);
  check("an OFX with no statement says that, rather than blaming the file",
    emptyOfx.statements.length === 0 && /no account statement/i.test(emptyOfx.problem ?? ""),
    emptyOfx.problem ?? "");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
