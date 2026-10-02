/**
 * MED 2.0 (Recuperação de Valores) models: tracking graph, blocking, analysis and the
 * sequential refund walk, per Manual Operacional do DICT v8.5 §20 and API DICT v2.12.
 */

export type Account = { id: string; label: string; psp: string; ispb: string; kind: "victim" | "mule" | "cashout" | "merchant" };
export type Tx = { id: string; from: string; to: string; amount: number; t: number /* minutes after root */ };

export const ACCOUNTS: Account[] = [
  { id: "V", label: "victim", psp: "Banco Exemplo", ispb: "12345678", kind: "victim" },
  { id: "A", label: "mule A", psp: "Pagamentos Digitais IP", ispb: "99999013", kind: "mule" },
  { id: "B", label: "mule B", psp: "Banco Fictício", ispb: "99999011", kind: "mule" },
  { id: "C", label: "mule C", psp: "Fintech Laranja SCD", ispb: "99999014", kind: "mule" },
  { id: "D", label: "small", psp: "Banco Fictício", ispb: "99999011", kind: "mule" },
  { id: "E", label: "late", psp: "Cooperativa Exemplo", ispb: "99999012", kind: "mule" },
  { id: "F", label: "mule F", psp: "Pagamentos Digitais IP", ispb: "99999013", kind: "mule" },
  { id: "G", label: "mule G", psp: "Cooperativa Exemplo", ispb: "99999012", kind: "mule" },
  { id: "H", label: "mule H", psp: "Banco Fictício", ispb: "99999011", kind: "mule" },
  { id: "I", label: "cash-out", psp: "Exchange Cripto IP", ispb: "99999015", kind: "cashout" },
  { id: "J", label: "store", psp: "Banco Grande S.A.", ispb: "99999016", kind: "merchant" },
];

export const TXS: Tx[] = [
  { id: "T0", from: "V", to: "A", amount: 10000, t: 0 },
  { id: "T1", from: "A", to: "B", amount: 4000, t: 12 },
  { id: "T2", from: "A", to: "C", amount: 3500, t: 38 },
  { id: "T3", from: "A", to: "D", amount: 150, t: 41 },
  { id: "T4", from: "A", to: "E", amount: 1800, t: 190 },
  { id: "T5", from: "B", to: "F", amount: 2500, t: 30 },
  { id: "T6", from: "B", to: "G", amount: 1200, t: 85 },
  { id: "T7", from: "C", to: "H", amount: 3100, t: 52 },
  { id: "T8", from: "H", to: "I", amount: 2900, t: 70 },
  { id: "T9", from: "F", to: "J", amount: 900, t: 64 },
];

export type GraphParams = { minAmount: number; hopWindowMin: number; maxHops: number; maxTx: number };

export type Exclusion = "below-min" | "outside-window" | "too-deep" | "max-tx" | "not-reached" | "not-yet";

export type Traced = { tx: Tx; depth: number; parent: string | null } | { tx: Tx; excluded: Exclusion };

/** BFS from the root transaction, applying TrackingGraphParameters. */
export function track(p: GraphParams, atMin = Infinity) {
  const included: { tx: Tx; depth: number; parent: string | null }[] = [{ tx: TXS[0], depth: 1, parent: null }];
  const why = new Map<string, Exclusion>();
  const queue = [included[0]];
  while (queue.length) {
    const cur = queue.shift()!;
    const outs = TXS.filter((t) => t.from === cur.tx.to && t.t > cur.tx.t && t.t <= atMin).sort((a, b) => a.t - b.t);
    for (const o of outs) {
      if (included.some((i) => i.tx.id === o.id)) continue;
      if (o.amount < p.minAmount) {
        why.set(o.id, "below-min");
        continue;
      }
      if (o.t - cur.tx.t > p.hopWindowMin) {
        why.set(o.id, "outside-window");
        continue;
      }
      if (cur.depth + 1 > p.maxHops) {
        why.set(o.id, "too-deep");
        continue;
      }
      if (included.length >= p.maxTx) {
        why.set(o.id, "max-tx");
        continue;
      }
      why.delete(o.id);
      const node = { tx: o, depth: cur.depth + 1, parent: cur.tx.id };
      included.push(node);
      queue.push(node);
    }
  }
  for (const t of TXS) if (!included.some((i) => i.tx.id === t.id) && !why.has(t.id)) why.set(t.id, t.t > atMin ? "not-yet" : "not-reached");
  return { included, why };
}

/** Balance of each account just after the last transaction (blocks are requested right after tracking). */
export function balances(atMin: number) {
  const b = new Map<string, number>(ACCOUNTS.map((a) => [a.id, 0]));
  b.set("V", 10000);
  for (const t of TXS) {
    if (t.t > atMin) continue;
    b.set(t.from, (b.get(t.from) ?? 0) - t.amount);
    b.set(t.to, (b.get(t.to) ?? 0) + t.amount);
  }
  // the cash-out exchange converts to crypto on arrival: nothing stays there to block
  b.set("I", 0);
  return b;
}

export type Report = {
  txId: string;
  depth: number;
  parent: string | null;
  requested: number; // InfractionAmount (here: the transaction amount)
  blocked: number;
  status: "OPEN" | "ACKNOWLEDGED" | "CLOSED" | "CANCELLED";
  result?: "AGREED" | "DISAGREED";
  refunded?: number;
};

/** Blocking: each receiving PSP blocks min(requested, available balance), pooled per account in BFS order. */
export function block(included: ReturnType<typeof track>["included"], atMin: number): Report[] {
  const bal = balances(atMin);
  const free = new Map(bal);
  return included.map((i) => {
    const acct = i.tx.to;
    const avail = Math.max(0, free.get(acct) ?? 0);
    const blocked = Math.min(i.tx.amount, avail);
    free.set(acct, avail - blocked);
    return { txId: i.tx.id, depth: i.depth, parent: i.parent, requested: i.tx.amount, blocked, status: "ACKNOWLEDGED" };
  });
}

/** Close reports; a DISAGREED report cancels every descendant no longer connected to the root. */
export function analyse(reports: Report[], disagreed: Set<string>): Report[] {
  const byId = new Map(reports.map((r) => [r.txId, r]));
  const connected = (r: Report): boolean => {
    if (disagreed.has(r.txId)) return false;
    if (!r.parent) return true;
    const p = byId.get(r.parent);
    return !!p && connected(p);
  };
  return reports.map((r) => {
    if (disagreed.has(r.txId)) return { ...r, status: "CLOSED", result: "DISAGREED" };
    if (r.parent && !connected(byId.get(r.parent)!)) return { ...r, status: "CANCELLED", result: undefined };
    return { ...r, status: "CLOSED", result: "AGREED" };
  });
}

/** Sequential refunds in BFS order: each ≤ blocked and ≤ root amount − refunded so far. */
export function refundWalk(reports: Report[], rootAmount: number): Report[] {
  let refunded = 0;
  return reports.map((r) => {
    if (r.result !== "AGREED") return r;
    const amt = Math.max(0, Math.min(r.blocked, r.requested, rootAmount - refunded));
    refunded += amt;
    return { ...r, refunded: amt };
  });
}

export const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/* ------------------------------------------------------------------------------------------ */
/* Pre-payment risk decision (illustrative: the BCB defines the inputs, not a scoring formula) */
/* ------------------------------------------------------------------------------------------ */

export type RiskInput = {
  amount: number;
  hour: number; // 0–23, payer's local time
  newDevice: boolean;
  firstTimeRecipient: boolean;
  payerToPerson: boolean; // receiver is a natural person
  keyAgeDays: number; // now − KeyOwnershipDate
  accountAgeDays: number; // now − OpeningDate
  muleD90: number;
  scammerD90: number;
  distinctReporters: number;
  openReports: number;
  settlementsM12: number;
  nightLimit: number; // the payer's nightly limit (default R$1,000 for PF→PF)
};

export type Factor = { label: string; points: number; source: string };
export type Decision = { verdict: "allow" | "warn" | "step-up" | "hold" | "block"; score: number; factors: Factor[]; hard?: string };

export function decide(x: RiskInput): Decision {
  const night = x.hour >= 20 || x.hour < 6;
  if (x.newDevice && x.amount > 200)
    return { verdict: "block", score: 100, factors: [], hard: "Unregistered device: at most R$200 per transaction and R$1,000 per day (IN BCB 491/2024, as amended)." };
  if (night && x.payerToPerson && x.amount > x.nightLimit)
    return { verdict: "block", score: 100, factors: [], hard: `Nightly limit (20h–6h) for PF → PF: ${brl(x.nightLimit)} (IN BCB 512/2024). Raising it takes effect only 24–48 h after the request.` };

  const f: Factor[] = [];
  const add = (label: string, points: number, source: string) => points && f.push({ label, points, source });
  add("recipient key owned < 7 days", x.keyAgeDays < 7 ? 18 : x.keyAgeDays < 30 ? 8 : 0, "KeyOwnershipDate");
  add("recipient account opened < 30 days", x.accountAgeDays < 30 ? 15 : x.accountAgeDays < 180 ? 5 : 0, "Account/OpeningDate");
  add("MULE_ACCOUNT markers (d90)", Math.min(30, x.muleD90 * 15), "FraudMarkers/MuleAccounts");
  add("SCAMMER_ACCOUNT markers (d90)", Math.min(35, x.scammerD90 * 20), "FraudMarkers/ScammerAccounts");
  add("distinct PSPs reporting", x.distinctReporters >= 2 ? 15 : x.distinctReporters === 1 ? 5 : 0, "DistinctFraudReporters");
  add("open infraction reports", Math.min(20, x.openReports * 7), "InfractionReports/OpenReports");
  add("no settlement history", x.settlementsM12 === 0 ? 6 : 0, "Spi/Settlements m12");
  add("first payment to this recipient", x.firstTimeRecipient ? 6 : 0, "payer PSP history");
  add("amount", x.amount >= 5000 ? 12 : x.amount >= 1000 ? 6 : 0, "payment");
  add("night time", night ? 6 : 0, "clock");
  add("new device (registered, low amount)", x.newDevice ? 8 : 0, "device registry");
  const score = Math.min(100, f.reduce((a, b) => a + b.points, 0));
  const verdict = score >= 70 ? "block" : score >= 50 ? "hold" : score >= 32 ? "step-up" : score >= 18 ? "warn" : "allow";
  return { verdict, score, factors: f.sort((a, b) => b.points - a.points) };
}
