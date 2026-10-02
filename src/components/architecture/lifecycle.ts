/**
 * The settlement cycle of one Pix between two direct participants, following the Manual de Fluxos do
 * Processo de Efetivação do Pix (§3.1.1) and the timestamps of the Manual de Tempos do Pix v7.0 (§4.1):
 * t0' AccptncDtTm · t1 pacs.008 CreDtTm · t1' SPI receives · t2 SPI makes pacs.008 available ·
 * t3' SPI receives pacs.002 · t4 finality · t5a pacs.002 available to payer PSP · t6a payer notified.
 */

export const LANES = ["Payer", "Payer PSP", "DICT", "SPI · Conta PI", "Payee PSP", "Payee"] as const;
export type Lane = 0 | 1 | 2 | 3 | 4 | 5;

export type Scenario = "ok" | "ac03" | "am04" | "timeout" | "ab11";

export type Budget = {
  /** DICT lookup round trip (before t0'; not in the 40 s budget) */
  dict: number;
  /** payer PSP: t1 − t0' (validation, anti-fraud, build + sign pacs.008) */
  payer: number;
  /** network + ICOM + SPI inbound half: t2 − t1 */
  spiIn: number;
  /** receiver PSP: t3' − t2 (read, validate, provisional credit, sign pacs.002) */
  receiver: number;
  /** SPI outbound half: t5a − t3' (settle, emit pacs.002s) */
  spiOut: number;
  /** payer PSP notifies the user: t6a − t5a */
  notify: number;
};

export const DEFAULT_BUDGET: Budget = { dict: 250, payer: 900, spiIn: 700, receiver: 1400, spiOut: 600, notify: 300 };

export type Ledger = {
  /** payer PSP Conta PI: available / blocked (SADP / SABK) */
  aAvail: number;
  aBlocked: number;
  bAvail: number;
  /** end users */
  payer: number;
  payerHeld: number;
  payee: number;
  payeeProvisional: number;
};

export type Step = {
  from: Lane;
  to: Lane;
  /** message on the wire, or null for an internal action (from === to) */
  msg: string | null;
  label: string;
  note: string;
  /** ms since t0' (negative before acceptance) */
  t: number;
  mark?: string;
  tone?: "ok" | "bad";
  ledger: Ledger;
};

export const AMOUNT = 150;
export const LIMIT_MS = 40_000;
/** maximum validation time t1 − t0′ for HIGH priority (IN BCB 243/2022, art. 18) */
export const VALIDATION_MS = 34_000;

export function buildSteps(sc: Scenario, b: Budget): Step[] {
  let L: Ledger = { aAvail: sc === "am04" ? 90 : 2_000_000, aBlocked: 0, bAvail: 750_000, payer: 1_200, payerHeld: 0, payee: 40, payeeProvisional: 0 };
  const steps: Step[] = [];
  const push = (s: Omit<Step, "ledger">, patch: Partial<Ledger> = {}) => {
    L = { ...L, ...patch };
    steps.push({ ...s, ledger: L });
  };

  const t0 = 0;
  push({ from: 0, to: 1, msg: null, label: "types key loja@exemplo.com.br, R$ 150", note: "The payer starts a Pix by key (formaDeIniciacao DICT).", t: -b.dict - 4_000 });
  push({ from: 1, to: 2, msg: "GET /entries/{key}", label: "DICT lookup (PI-PayerId, PI-EndToEndId)", note: "The payer PSP asks the DICT which account the key points to. It already knows the EndToEndId it will use. DICT SLA: P99 1 s.", t: -b.dict - 4_000 + 10 });
  push({ from: 2, to: 1, msg: "200 Entry", label: "ISPB 87654321, account, masked name", note: "The DICT returns the payee's PSP, branch, account, type and owner name; the app shows it masked.", t: -4_000 + 10 });
  push({ from: 0, to: 1, msg: null, label: "confirms → t0′ (AccptncDtTm)", note: "The 40 s clock of the Manual de Tempos starts when the payer PSP receives the confirmed order.", t: t0, mark: "t0′" });
  push({ from: 1, to: 1, msg: null, label: "hold R$ 150 in payer's account, anti-fraud, build + sign", note: "The payer PSP blocks the amount in the customer's account, then builds and XMLDSig-signs the pacs.008 (CreDtTm = t1).", t: b.payer, mark: "t1" }, { payer: L.payer - AMOUNT, payerHeld: AMOUNT });
  push({ from: 1, to: 3, msg: "pacs.008", label: "POST /api/v1/in/{ispb}/msgs (ICOM)", note: "Signed pacs.008 over HTTPS + mTLS on the RSFN. ICOM answers 201 + PI-ResourceId: recorded, will be processed. t1′ = arrival.", t: b.payer + Math.round(b.spiIn * 0.3), mark: "t1′" });

  if (sc === "ab11") {
    push({ from: 3, to: 3, msg: null, label: "t1 − t0′ above the 34 s validation limit", note: "The SPI compares CreDtTm with the AccptncDtTm the payer PSP reported. Too much time spent before sending: the order is refused.", t: b.payer + Math.round(b.spiIn * 0.6), tone: "bad" });
    push({ from: 3, to: 1, msg: "pacs.002 RJCT AB11", label: "timeout at the debtor agent", note: "AB11: the payer's PSP took too long. Nothing was blocked in the Conta PI.", t: b.payer + b.spiIn, tone: "bad" });
    push({ from: 1, to: 0, msg: null, label: "release hold, show failure", note: "End of process.", t: b.payer + b.spiIn + b.notify, mark: "t6a", tone: "bad" }, { payer: L.payer + AMOUNT, payerHeld: 0 });
    return steps;
  }

  if (sc === "am04") {
    push({ from: 3, to: 3, msg: null, label: "XSD + signature OK; block fails: balance < R$ 150", note: "The SPI tries to block the amount in the payer PSP's Conta PI. No overdraft exists: rejection is immediate and final.", t: b.payer + Math.round(b.spiIn * 0.6), tone: "bad" });
    push({ from: 3, to: 1, msg: "pacs.002 RJCT AM04", label: "insufficient funds in the Conta PI", note: "Only the payer PSP hears about it; the payee PSP never saw the order.", t: b.payer + b.spiIn, tone: "bad" });
    push({ from: 1, to: 0, msg: null, label: "release hold, show failure", note: "The payer PSP releases the customer hold. Its treasury should have topped up the Conta PI (via the STR) earlier.", t: b.payer + b.spiIn + b.notify, mark: "t6a", tone: "bad" }, { payer: L.payer + AMOUNT, payerHeld: 0 });
    return steps;
  }

  push({ from: 3, to: 3, msg: null, label: "validate, check budget, block R$ 150 in PSP A's Conta PI", note: "XSD, signature and sender checks (failures → admi.002), business rules, then a hold on the payer PSP's Conta PI: SADP falls, SABK rises.", t: b.payer + Math.round(b.spiIn * 0.6) }, { aAvail: L.aAvail - AMOUNT, aBlocked: AMOUNT });
  const t2 = b.payer + b.spiIn;
  push({ from: 3, to: 4, msg: "pacs.008", label: "available to the payee PSP (Fr = 00038166) → t2", note: "The SPI re-issues the order with its own AppHdr and MsgId; same EndToEndId. The payee PSP pulls it via the ICOM long-poll.", t: t2, mark: "t2" });

  if (sc === "timeout") {
    push({ from: 4, to: 4, msg: null, label: "…payee PSP is slow (GC pause, DB lock, outage)", note: "The receiver must answer within the budget left; the SPI tracks t0′ + 40 s using the AccptncDtTm the payer reported.", t: t2 + 2_000, tone: "bad" });
    push({ from: 3, to: 3, msg: null, label: "t0′ + 40 s reached: abort, release hold", note: "After t1′ the rejection is always made by the SPI. The blocked amount returns to SADP.", t: LIMIT_MS, tone: "bad" }, { aAvail: L.aAvail + AMOUNT, aBlocked: 0 });
    push({ from: 3, to: 1, msg: "pacs.002 RJCT AB03", label: "settlement aborted: timeout in the SPI", note: "Both PSPs are told; any late pacs.002 from the payee PSP will be refused.", t: LIMIT_MS + b.spiOut, tone: "bad" });
    push({ from: 3, to: 4, msg: "pacs.002 RJCT AB03", label: "undo provisional credit", note: "The payee PSP must reverse any provisional annotation.", t: LIMIT_MS + b.spiOut, tone: "bad" });
    push({ from: 1, to: 0, msg: null, label: "release hold, show failure", note: "Customer's money was never debited for real.", t: LIMIT_MS + b.spiOut + b.notify, mark: "t6a", tone: "bad" }, { payer: L.payer + AMOUNT, payerHeld: 0 });
    return steps;
  }

  if (sc === "ac03") {
    push({ from: 4, to: 4, msg: null, label: "account 99887766 does not exist (closed)", note: "The payee PSP validates the destination account and owner. Wrong account → AC03; CPF/CNPJ mismatch → BE01.", t: t2 + Math.round(b.receiver * 0.6), tone: "bad" });
    push({ from: 4, to: 3, msg: "pacs.002 RJCT AC03", label: "→ t3′", note: "A business rejection from the receiver. No money has moved: the hold is all there is to undo.", t: t2 + b.receiver, mark: "t3′", tone: "bad" });
    push({ from: 3, to: 3, msg: null, label: "release the Conta PI hold", note: "SABK back to SADP.", t: t2 + b.receiver + 50, tone: "bad" }, { aAvail: L.aAvail + AMOUNT, aBlocked: 0 });
    push({ from: 3, to: 1, msg: "pacs.002 RJCT AC03", label: "forwarded to the payer PSP", note: "Same OrgnlEndToEndId; the payer PSP maps the code to a user message.", t: t2 + b.receiver + b.spiOut, mark: "t5a", tone: "bad" });
    push({ from: 1, to: 0, msg: null, label: "release hold, show 'invalid account'", note: "End of process.", t: t2 + b.receiver + b.spiOut + b.notify, mark: "t6a", tone: "bad" }, { payer: L.payer + AMOUNT, payerHeld: 0 });
    return steps;
  }

  push({ from: 4, to: 4, msg: null, label: "validate account, provisional credit", note: "The payee PSP checks account and owner, and annotates a provisional credit it can still undo.", t: t2 + Math.round(b.receiver * 0.6) }, { payeeProvisional: AMOUNT });
  const t3 = t2 + b.receiver;
  push({ from: 4, to: 3, msg: "pacs.002 ACSP", label: "accepted, settle it → t3′", note: "ACSP = accepted, settlement in process. Signed by the payee PSP with its own new MsgId.", t: t3, mark: "t3′", tone: "ok" });
  push({ from: 3, to: 3, msg: null, label: "t4 finality: debit A, credit B (gross, central bank money)", note: "The held amount moves from PSP A's Conta PI to PSP B's. Irrevocable and unconditional, timestamped in UTC.", t: t3 + Math.round(b.spiOut * 0.4), mark: "t4", tone: "ok" }, { aBlocked: 0, bAvail: L.bAvail + AMOUNT });
  push({ from: 3, to: 4, msg: "pacs.002 ACCC", label: "settled: credit the payee for real", note: "The payee PSP turns the provisional credit into a final one and notifies the payee (and fires its API Pix webhook if there is a txid).", t: t3 + b.spiOut, tone: "ok" });
  push({ from: 4, to: 5, msg: null, label: "\"You received R$ 150\"", note: "The payee usually learns first.", t: t3 + b.spiOut + b.notify, tone: "ok" }, { payee: L.payee + AMOUNT, payeeProvisional: 0 });
  push({ from: 3, to: 1, msg: "pacs.002 ACSC", label: "settled: debit the payer for real → t5a", note: "ACSC goes to the payer side, ACCC to the payee side.", t: t3 + b.spiOut + 40, mark: "t5a", tone: "ok" });
  push({ from: 1, to: 0, msg: null, label: "debit final, show receipt → t6a", note: "Payer experience t6a − t0′: SLA P50 6 s, P99 10 s.", t: t3 + b.spiOut + 40 + b.notify, mark: "t6a", tone: "ok" }, { payerHeld: 0 });
  return steps;
}

export function finalityAt(steps: Step[]) {
  return steps.find((s) => s.mark === "t4")?.t ?? null;
}
