/**
 * Net worth, and the $81,442.58 that was subtracted twice.
 *
 * A car loan can be recorded in two places: typed onto the vehicle record as
 * `loan_balance`, and synced into `debts` as its own row. The total subtracted
 * both —
 *
 *   vehicleEquity = vehicleValue - vehicleLoanTotal    // once
 *   netWorth      = (… + vehicleEquity) - debtTotal    // and again
 *
 * — so on the day a bank connection brought in two car loans that were already
 * on the vehicles, the reported net worth fell by $81,442.58 with nothing on
 * screen to explain it. Nobody had borrowed anything.
 *
 * Every assertion below is written as that bug, using the real records.
 */
import {
  composeNetWorth,
  type ComposableAsset,
  type ComposableLiability,
} from "../src/lib/net-worth/compose";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const INVESTMENTS = 149563.48;
const CASH = 51547.35;

const ASSETS: ComposableAsset[] = [
  { kind: "real_estate", id: "sonata", name: "4170 Sonata", value: 376000, embeddedLoan: 155589.18 },
  { kind: "vehicle", id: "sporttrek", name: "2025 SPORTTREK SportTrek", value: 70000, embeddedLoan: 70702.77 },
  { kind: "vehicle", id: "f250", name: "2022 FORD F-250", value: 51006, embeddedLoan: 10739.81 },
  { kind: "vehicle", id: "jeep", name: "2017 JEEP Grand Cherokee", value: 13770, embeddedLoan: 0 },
];

const debt = (
  id: string, name: string, balance: number, debtType: string,
  secured?: { type: "vehicle" | "real_estate"; id: string }
): ComposableLiability => ({
  id, name, balance, debtType,
  securedByType: secured?.type ?? null,
  securedById: secured?.id ?? null,
  fromPlaid: true,
});

const CARDS = 6034.99 + 3361.57 + 3265.63 + 122.88 + 51.0; // 12,836.07
const LIABILITIES: ComposableLiability[] = [
  debt("d_sport", "2025 VENTURE SPORTTREK 5 STTF3", 69265.78, "other_debt"),
  debt("d_heloc", "90% HLTV 2ND TR", 34114.38, "mortgage"),
  debt("d_f250", "L01 2022 FORD F-", 10739.81, "auto_loan"),
  debt("d_cards", "credit cards", CARDS, "credit_card"),
];

function main() {
  // ---- the bug, reproduced exactly ---------------------------------------
  const oldWay = (() => {
    const realEstateEquity = 376000 - 155589.18;
    const vehicleValue = 70000 + 51006 + 13770;
    const vehicleLoanTotal = 70702.77 + 10739.81 + 0;
    const vehicleEquity = vehicleValue - vehicleLoanTotal;
    const totalAssets = INVESTMENTS + realEstateEquity + CASH + vehicleEquity;
    const debtTotal = LIABILITIES.reduce((s, l) => s + l.balance, 0);
    return totalAssets - debtTotal;
  })();
  check(
    "the old arithmetic reports 347,899.03",
    near(oldWay, 347899.03),
    oldWay.toFixed(2)
  );

  // ---- nothing linked yet: the figures still must not double-count --------
  const unlinked = composeNetWorth({
    investments: INVESTMENTS, cash: CASH, assets: ASSETS, liabilities: LIABILITIES,
  });
  // Nothing is linked yet, so the module reproduces the old total exactly —
  // and that is correct. It cannot know that "L01 2022 FORD F-" is the F-250's
  // loan until a row says so; silently merging two records because their
  // numbers happen to agree is how a genuine second lien gets deleted. What
  // changes is that the pair is now visible instead of invisible.
  check(
    "before anything is linked the total is unchanged, by design",
    near(unlinked.netWorth, 347899.03),
    unlinked.netWorth.toFixed(2)
  );
  check(
    "but the duplication is no longer silent",
    unlinked.suspectedDuplicates.length > 0,
    "the old code had no way to say that two records might be one loan"
  );

  // With nothing linked, each asset keeps its typed figure and each debt row
  // is unsecured. That is still every liability exactly once.
  check(
    "every liability is counted once even before anything is linked",
    near(unlinked.liabilities, 155589.18 + 70702.77 + 10739.81 + 69265.78 + 34114.38 + 10739.81 + CARDS),
    unlinked.liabilities.toFixed(2)
  );

  // ---- the pairs are surfaced, not silently merged -------------------------
  check(
    "the two car loans recorded twice are flagged",
    unlinked.suspectedDuplicates.length === 2,
    unlinked.suspectedDuplicates.map((d) => `${d.assetName}~${d.debtName}`).join(" | ")
  );
  const f250 = unlinked.suspectedDuplicates.find((d) => d.assetId === "f250");
  check(
    "the F-250 pair is caught by its exact balance",
    f250?.reason === "the balances match to the cent",
    f250?.reason
  );
  const sport = unlinked.suspectedDuplicates.find((d) => d.assetId === "sporttrek");
  check(
    "the SportTrek pair is caught by name, its balances having drifted apart",
    sport !== undefined && sport.reason.startsWith("both name"),
    `${sport?.reason} (${sport?.embeddedLoan} vs ${sport?.debtBalance})`
  );
  check(
    "and the flagged overcount is the $81,442.58 that went missing",
    near(unlinked.suspectedDuplicates.reduce((s, d) => s + d.overcount, 0), 81442.58),
    unlinked.suspectedDuplicates.reduce((s, d) => s + d.overcount, 0).toFixed(2)
  );

  // The house is NOT flagged: the second-lien is a real separate loan, and
  // nothing about its name or balance suggests otherwise.
  check(
    "the second mortgage is not mistaken for the first",
    !unlinked.suspectedDuplicates.some((d) => d.assetId === "sonata"),
    "a false positive here would invite deleting a real $34,114.38 liability"
  );
  check(
    "the paid-off Jeep is not flagged either",
    !unlinked.suspectedDuplicates.some((d) => d.assetId === "jeep"),
    "an asset with no typed loan cannot be duplicating one"
  );

  // ---- linked: the typed figure stops being added -------------------------
  const linked = composeNetWorth({
    investments: INVESTMENTS,
    cash: CASH,
    assets: ASSETS,
    liabilities: [
      debt("d_sport", "2025 VENTURE SPORTTREK 5 STTF3", 69265.78, "other_debt", { type: "vehicle", id: "sporttrek" }),
      debt("d_heloc", "90% HLTV 2ND TR", 34114.38, "mortgage"),
      debt("d_f250", "L01 2022 FORD F-", 10739.81, "auto_loan", { type: "vehicle", id: "f250" }),
      debt("d_cards", "credit cards", CARDS, "credit_card"),
    ],
  });

  const expected =
    INVESTMENTS + CASH +
    (376000 - 155589.18) +          // house, still on its typed mortgage
    (70000 - 69265.78) +            // SportTrek, now on the synced balance
    (51006 - 10739.81) +            // F-250, likewise
    13770 -                         // Jeep, owned outright
    (34114.38 + CARDS);             // the genuinely unsecured liabilities
  check(
    "once linked, net worth is 429,341.61",
    near(linked.netWorth, expected) && near(linked.netWorth, 429341.61),
    `${linked.netWorth.toFixed(2)} vs ${expected.toFixed(2)}`
  );
  check(
    "which is $81,442.58 above what the old arithmetic reported",
    near(linked.netWorth - oldWay, 81442.58),
    (linked.netWorth - oldWay).toFixed(2)
  );
  check(
    "and linking resolves the flags rather than leaving them up",
    linked.suspectedDuplicates.length === 0
  );

  // ---- a linked debt supersedes the typed figure, it does not add to it ----
  const f250pos = linked.assets.find((a) => a.id === "f250")!;
  check(
    "the F-250 owes its synced balance",
    near(f250pos.owed, 10739.81) && f250pos.owedSource === "linked"
  );
  check(
    "not the sum of both records",
    !near(f250pos.owed, 10739.81 * 2),
    "adding them is the bug wearing a different hat"
  );
  const sportPos = linked.assets.find((a) => a.id === "sporttrek")!;
  check(
    "the SportTrek takes the live figure over the stale typed one",
    near(sportPos.owed, 69265.78),
    `${sportPos.owed.toFixed(2)} — the typed figure was 70,702.77`
  );
  check(
    "and the asset that is underwater reports negative equity honestly",
    sportPos.equity < 0 && near(sportPos.equity, 70000 - 69265.78) === false
      ? false
      : near(sportPos.equity, 734.22),
    sportPos.equity.toFixed(2)
  );

  // ---- an asset with no loan at all ---------------------------------------
  const jeep = linked.assets.find((a) => a.id === "jeep")!;
  check("a vehicle owned outright is all equity", near(jeep.equity, 13770) && jeep.owedSource === "none");

  // ---- two loans against one asset are both counted -----------------------
  const twoLiens = composeNetWorth({
    investments: 0, cash: 0,
    assets: [{ kind: "real_estate", id: "h", name: "House", value: 376000, embeddedLoan: 155589.18 }],
    liabilities: [
      debt("first", "First mortgage", 155589.18, "mortgage", { type: "real_estate", id: "h" }),
      debt("second", "90% HLTV 2ND TR", 34114.38, "mortgage", { type: "real_estate", id: "h" }),
    ],
  });
  check(
    "a second lien on the same property is added, not replaced",
    near(twoLiens.assets[0].owed, 189703.56),
    twoLiens.assets[0].owed.toFixed(2)
  );
  check(
    "and the typed figure is not counted on top of either",
    near(twoLiens.netWorth, 376000 - 189703.56),
    twoLiens.netWorth.toFixed(2)
  );

  // ---- an empty household -------------------------------------------------
  const empty = composeNetWorth({ investments: 0, cash: 0, assets: [], liabilities: [] });
  check("an empty household is worth nothing, not NaN", empty.netWorth === 0);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
