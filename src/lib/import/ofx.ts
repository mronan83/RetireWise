/**
 * OFX/QFX statements for accounts that are not investments.
 *
 * The importer already read QFX, but only ever looked for `<INVPOSLIST>` and
 * `<SECLIST>`. Handed an Apple Card statement it recognised the file as OFX,
 * found no positions, and told the owner "No holdings found in the file.
 * Check the format" — blaming a correct file for a gap in the reader. A card
 * balance could not be imported at all.
 *
 * ## Routing is reading, not guessing
 *
 * OFX says what each statement is. There is no inference to do and none is
 * done here:
 *
 *   <CREDITCARDMSGSRSV1> / <CCSTMTRS>   a credit card
 *   <BANKMSGSRSV1> / <STMTRS>           <ACCTTYPE> names it: CHECKING,
 *                                       SAVINGS, MONEYMRKT, CD, CREDITLINE
 *   <INVSTMTMSGSRSV1> / <INVSTMTRS>     an investment account
 *   <LOANMSGSRSV1> / <LOANSTMTRS>       a loan
 *
 * Every statement carries `kindFrom`, naming the marker that decided it, so a
 * screen can show why a file was filed where it was rather than asking anyone
 * to trust it.
 *
 * ## The sign is the dangerous part
 *
 * A credit card's `<LEDGERBAL><BALAMT>` is conventionally NEGATIVE when the
 * cardholder owes money — the account is in deficit from the issuer's side.
 * `debts.current_balance` here is positive when money is owed. Some issuers
 * write the balance the other way round.
 *
 * `Math.abs()` reads as the obvious fix and is wrong: it turns an overpaid
 * card, a real credit balance, into a debt of the same size, and it does so
 * silently. This codebase has been bitten by exactly this before — Plaid
 * writes cash INTO an account as a negative amount — and by its sibling, a
 * plausible number appearing where there should have been none.
 *
 * So the convention is derived from evidence in the file itself: payments and
 * purchases must disagree in sign, and which way round they run settles it.
 * Where the file offers no evidence, the reading is marked `assumed` and the
 * caller is expected to put it in front of the owner before writing anything.
 *
 * Nothing here touches the database. It reads text and reports what it found.
 */

export type StatementKind =
  | "credit_card"
  | "line_of_credit"
  | "loan"
  | "checking"
  | "savings"
  | "money_market"
  | "cd"
  | "other_cash"
  | "investment";

/** Which part of RetireWise a statement belongs in. */
export type ImportTarget = "debt" | "cash" | "investment";

export type OfxTransaction = {
  /** FITID — the issuer's own id for the row, where one is given. */
  id: string | null;
  /** YYYY-MM-DD. */
  date: string | null;
  /** Exactly as written in the file, sign included. */
  amount: number;
  /** TRNTYPE, e.g. DEBIT, CREDIT, PAYMENT, INT, FEE. */
  type: string;
  description: string;
};

export type BalanceReading = {
  /** `BALAMT` exactly as the file wrote it. Kept so a screen can show it. */
  raw: number;
  /**
   * The same balance in RetireWise's own sign: positive when money is owed
   * on a debt, positive when money is held in a cash account. A negative
   * value on a debt is a genuine credit balance, never an error to clamp.
   */
  value: number;
  /** YYYY-MM-DD, from DTASOF. Null when the file omits it. */
  asOf: string | null;
  /** How the sign was settled, in words the owner can check. */
  convention: string;
  /**
   * stated  — the account's sign is not in question (a bank balance)
   * derived — settled by evidence in this file's own transactions
   * assumed — no evidence; a default was applied and must be confirmed
   */
  confidence: "stated" | "derived" | "assumed";
};

export type OfxStatement = {
  kind: StatementKind;
  target: ImportTarget;
  /** The marker that decided `kind`, quoted from the file. */
  kindFrom: string;
  institution: string | null;
  /** Last four of ACCTID only. A full account number is not ours to keep. */
  accountTail: string | null;
  currency: string;
  balance: BalanceReading | null;
  /** AVAILBAL — available credit on a card, available funds on a bank account. */
  available: number | null;
  transactions: OfxTransaction[];
  periodStart: string | null;
  periodEnd: string | null;
};

export type OfxParse = {
  statements: OfxStatement[];
  /**
   * Why nothing usable was found, phrased as what is missing rather than as
   * a complaint about the file. Null when at least one statement was read.
   */
  problem: string | null;
};

// ---------------------------------------------------------------------------
// Lexing. OFX 1.x is SGML — leaf elements have no closing tag — and OFX 2.x is
// real XML. Aggregates are closed in both, so reading an aggregate by its
// closing tag works for either, and a leaf value is whatever follows the tag
// up to the next `<` or line break.
// ---------------------------------------------------------------------------

export function isOfx(text: string): boolean {
  return /(<OFX>|<OFXHEADER|OFXHEADER:)/i.test(text);
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

/**
 * Every `<NAME>…</NAME>` aggregate in the text.
 *
 * Falls back to reading from the opening tag to the next opening tag of the
 * same name, or to the end, when a file omits the closing tag. That is
 * malformed OFX, and it exists.
 */
function aggregates(text: string, name: string): string[] {
  const closed = [...text.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "gi"))];
  if (closed.length > 0) return closed.map((m) => m[1]);

  const opens = [...text.matchAll(new RegExp(`<${name}>`, "gi"))];
  return opens.map((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < opens.length ? opens[i + 1].index! : text.length;
    return text.slice(start, end);
  });
}

/**
 * An OFX money amount.
 *
 * `1,234.56` and `1234,56` are both legal — the separator depends on the
 * issuer's locale, not on the spec. Deciding by which separator comes last
 * handles both without mistaking a thousands comma for a decimal point.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/,/g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** `20260920120000.000[-5:EST]` → `2026-09-20`. */
export function parseOfxDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

// ---------------------------------------------------------------------------
// The sign of a credit balance
// ---------------------------------------------------------------------------

const PAYMENT_NAME = /\b(payment|thank you|autopay|auto pay|pymt)\b/i;
const PAYMENT_TYPE = /^(CREDIT|PAYMENT|DIRECTDEP|XFER|DEP)$/i;

function looksLikePayment(t: OfxTransaction): boolean {
  return PAYMENT_TYPE.test(t.type) || PAYMENT_NAME.test(t.description);
}

/**
 * Settle which way round this issuer writes a credit card balance.
 *
 * Payments and purchases run in opposite directions whichever convention is
 * in use, so their signs identify it. Purchases alone are enough — a card
 * with spending on it and no payment is the common case for a new import.
 *
 * Returns the amount OWED: positive when money is owed, negative when the
 * card is in credit. A card in credit is a real state, not a sign error, and
 * is never clamped to zero here.
 */
export function interpretOwedBalance(
  raw: number,
  transactions: OfxTransaction[]
): BalanceReading {
  const payments = transactions.filter(looksLikePayment);
  const purchases = transactions.filter((t) => !looksLikePayment(t));
  const sum = (rows: OfxTransaction[]) => rows.reduce((s, t) => s + t.amount, 0);

  const paySum = sum(payments);
  const buySum = sum(purchases);

  if (payments.length > 0 && purchases.length > 0 && paySum > 0 && buySum < 0) {
    return {
      raw,
      value: -raw,
      asOf: null,
      convention:
        "payments are positive and purchases negative, so a negative balance is money owed",
      confidence: "derived",
    };
  }
  if (payments.length > 0 && purchases.length > 0 && paySum < 0 && buySum > 0) {
    return {
      raw,
      value: raw,
      asOf: null,
      convention:
        "payments are negative and purchases positive, so a positive balance is money owed",
      confidence: "derived",
    };
  }
  if (purchases.length > 0 && buySum < 0) {
    return {
      raw,
      value: -raw,
      asOf: null,
      convention: "purchases are written as negative, so a negative balance is money owed",
      confidence: "derived",
    };
  }
  if (purchases.length > 0 && buySum > 0) {
    return {
      raw,
      value: raw,
      asOf: null,
      convention: "purchases are written as positive, so a positive balance is money owed",
      confidence: "derived",
    };
  }

  // Nothing in the file settles it. The common convention is applied and
  // flagged, because a wrong guess here files a credit balance as a debt.
  return {
    raw,
    value: raw <= 0 ? -raw : raw,
    asOf: null,
    convention:
      raw <= 0
        ? "no transactions to check against; read as money owed, the usual convention for a negative card balance"
        : "no transactions to check against; read as money owed, but a positive balance can also mean the card is overpaid",
    confidence: "assumed",
  };
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** ACCTTYPE on a bank statement, which names the account outright. */
const BANK_ACCT_TYPES: Record<string, StatementKind> = {
  CHECKING: "checking",
  SAVINGS: "savings",
  MONEYMRKT: "money_market",
  CD: "cd",
  CREDITLINE: "line_of_credit",
};

const TARGET: Record<StatementKind, ImportTarget> = {
  credit_card: "debt",
  line_of_credit: "debt",
  loan: "debt",
  checking: "cash",
  savings: "cash",
  money_market: "cash",
  cd: "cash",
  other_cash: "cash",
  investment: "investment",
};

function readTransactions(block: string): OfxTransaction[] {
  return aggregates(block, "STMTTRN").map((t) => ({
    id: tag(t, "FITID") || null,
    date: parseOfxDate(tag(t, "DTPOSTED")),
    amount: parseAmount(tag(t, "TRNAMT")) ?? 0,
    type: (tag(t, "TRNTYPE") || "").toUpperCase(),
    description: tag(t, "NAME") || tag(t, "MEMO") || "",
  }));
}

function readBalances(block: string) {
  const ledger = aggregates(block, "LEDGERBAL")[0] ?? "";
  const avail = aggregates(block, "AVAILBAL")[0] ?? "";
  return {
    raw: parseAmount(tag(ledger, "BALAMT")),
    asOf: parseOfxDate(tag(ledger, "DTASOF")) ?? parseOfxDate(tag(block, "DTASOF")),
    available: parseAmount(tag(avail, "BALAMT")),
  };
}

function accountTail(block: string, aggregate: string): string | null {
  const acct = aggregates(block, aggregate)[0] ?? "";
  const id = tag(acct, "ACCTID");
  if (!id) return null;
  const digits = id.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : id.slice(-4);
}

export function parseOfxStatements(text: string): OfxParse {
  if (!isOfx(text)) {
    return { statements: [], problem: "This file is not OFX or QFX." };
  }

  const institution =
    tag(aggregates(text, "FI")[0] ?? "", "ORG") || tag(text, "ORG") || null;

  const statements: OfxStatement[] = [];

  // ---- credit cards -------------------------------------------------------
  for (const block of aggregates(text, "CCSTMTRS")) {
    const { raw, asOf, available } = readBalances(block);
    const transactions = readTransactions(block);
    const balance =
      raw === null
        ? null
        : { ...interpretOwedBalance(raw, transactions), asOf };

    statements.push({
      kind: "credit_card",
      target: "debt",
      kindFrom: "<CCSTMTRS> — a credit card statement",
      institution,
      accountTail: accountTail(block, "CCACCTFROM"),
      currency: tag(block, "CURDEF") || "USD",
      balance,
      available,
      transactions,
      periodStart: parseOfxDate(tag(block, "DTSTART")),
      periodEnd: parseOfxDate(tag(block, "DTEND")),
    });
  }

  // ---- bank accounts, which name their own type ---------------------------
  for (const block of aggregates(text, "STMTRS")) {
    const acct = aggregates(block, "BANKACCTFROM")[0] ?? "";
    const declared = (tag(acct, "ACCTTYPE") || "").toUpperCase();
    const kind = BANK_ACCT_TYPES[declared] ?? "other_cash";

    const { raw, asOf, available } = readBalances(block);
    const transactions = readTransactions(block);

    // A line of credit is a debt, so its balance carries the same sign
    // question a card's does. A deposit account's does not.
    const balance =
      raw === null
        ? null
        : kind === "line_of_credit"
          ? { ...interpretOwedBalance(raw, transactions), asOf }
          : {
              raw,
              value: raw,
              asOf,
              convention: "a deposit account balance is positive when funds are held",
              confidence: "stated" as const,
            };

    statements.push({
      kind,
      target: TARGET[kind],
      kindFrom: declared
        ? `<STMTRS> with <ACCTTYPE>${declared}`
        : "<STMTRS> with no <ACCTTYPE> given",
      institution,
      accountTail: accountTail(block, "BANKACCTFROM"),
      currency: tag(block, "CURDEF") || "USD",
      balance,
      available,
      transactions,
      periodStart: parseOfxDate(tag(block, "DTSTART")),
      periodEnd: parseOfxDate(tag(block, "DTEND")),
    });
  }

  // ---- loans (OFX 2.2) ----------------------------------------------------
  for (const block of aggregates(text, "LOANSTMTRS")) {
    const loanBal = aggregates(block, "LOANBAL")[0] ?? "";
    const raw =
      parseAmount(tag(loanBal, "BALAMT")) ??
      parseAmount(tag(loanBal, "PRINCIPALBALANCE")) ??
      readBalances(block).raw;

    statements.push({
      kind: "loan",
      target: "debt",
      kindFrom: "<LOANSTMTRS> — a loan statement",
      institution,
      accountTail: accountTail(block, "LOANACCTFROM"),
      currency: tag(block, "CURDEF") || "USD",
      balance:
        raw === null
          ? null
          : {
              raw,
              value: Math.abs(raw),
              asOf: parseOfxDate(tag(loanBal, "DTASOF")) ?? readBalances(block).asOf,
              convention: "a loan balance is the principal outstanding",
              confidence: raw < 0 ? "derived" : "stated",
            },
      available: null,
      transactions: readTransactions(block),
      periodStart: parseOfxDate(tag(block, "DTSTART")),
      periodEnd: parseOfxDate(tag(block, "DTEND")),
    });
  }

  // ---- investments, which the holdings importer already reads -------------
  for (const block of aggregates(text, "INVSTMTRS")) {
    statements.push({
      kind: "investment",
      target: "investment",
      kindFrom: "<INVSTMTRS> — an investment statement",
      institution,
      accountTail: accountTail(block, "INVACCTFROM"),
      currency: tag(block, "CURDEF") || "USD",
      balance: null,
      available: null,
      transactions: [],
      periodStart: parseOfxDate(tag(block, "DTSTART")),
      periodEnd: parseOfxDate(tag(block, "DTEND")),
    });
  }

  if (statements.length === 0) {
    return {
      statements: [],
      problem:
        "This OFX file has no account statement in it — no credit card, bank, loan or investment section was found.",
    };
  }

  return { statements, problem: null };
}

// ---------------------------------------------------------------------------
// What RetireWise should call it
// ---------------------------------------------------------------------------

export type DebtType =
  | "mortgage"
  | "auto_loan"
  | "student_loan"
  | "heloc"
  | "personal_loan"
  | "credit_card"
  | "other_debt";

export type CashType =
  | "checking"
  | "savings"
  | "high_yield_savings"
  | "money_market"
  | "cd"
  | "ibonds"
  | "emergency_fund"
  | "other_cash";

/** A starting point for the form, not a decision. The owner can change it. */
export function suggestDebtType(kind: StatementKind): DebtType {
  if (kind === "credit_card") return "credit_card";
  if (kind === "line_of_credit") return "personal_loan";
  return "other_debt";
}

export function suggestCashType(kind: StatementKind): CashType {
  switch (kind) {
    case "checking":
      return "checking";
    case "savings":
      return "savings";
    case "money_market":
      return "money_market";
    case "cd":
      return "cd";
    default:
      return "other_cash";
  }
}

/** A name for the row, from whatever the file was willing to say. */
export function suggestName(s: OfxStatement): string {
  const base =
    s.institution?.trim() ||
    {
      credit_card: "Credit Card",
      line_of_credit: "Line of Credit",
      loan: "Loan",
      checking: "Checking",
      savings: "Savings",
      money_market: "Money Market",
      cd: "CD",
      other_cash: "Cash Account",
      investment: "Investment Account",
    }[s.kind];
  return s.accountTail ? `${base} ····${s.accountTail}` : base;
}
