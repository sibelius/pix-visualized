import { rng } from "@/lib/random";

/**
 * RTGS (what the SPI does: each Pix settles gross, immediately, in central bank money, no overdraft, no
 * queue — insufficient balance is an immediate AM04) versus deferred net settlement (DNS: positions are
 * netted and settled once at the end of a cycle, like the old DOC/boleto clearing).
 */

export type Payment = { i: number; from: number; to: number; amount: number };

export function genPayments(nBanks: number, nPay: number, skew: number, seed: number, timing = 0): Payment[] {
  const r = rng(seed);
  // bank "size" weights: skew 0 = equal, 1 = very concentrated
  const w = Array.from({ length: nBanks }, (_, k) => Math.pow(1 / (k + 1), skew * 1.6));
  // intraday timing mismatch: even-indexed PSPs mostly pay early and get paid late, odd ones the opposite
  const tilt = (k: number, t: number, sending: boolean) => {
    const phase = (k % 2 === 0 ? 1 : -1) * (1 - 2 * t) * (sending ? 1 : -1);
    return Math.max(0.05, 1 + 3 * timing * phase);
  };
  const pick = (t: number, sending: boolean, exclude = -1) => {
    const ww = w.map((x, k) => (k === exclude ? 0 : x * tilt(k, t, sending)));
    const tot = ww.reduce((a, b) => a + b, 0);
    let u = r.next() * tot;
    for (let k = 0; k < nBanks; k++) {
      u -= ww[k];
      if (u <= 0 && ww[k] > 0) return k;
    }
    return exclude === nBanks - 1 ? 0 : nBanks - 1;
  };
  const out: Payment[] = [];
  for (let i = 0; i < nPay; i++) {
    const t = i / Math.max(1, nPay - 1);
    const from = pick(t, true);
    const to = pick(t, false, from);
    // heavy-tailed amounts: most Pix are small, a few are large (R$)
    const amount = Math.round(Math.exp(r.normal(4.6, 1.1)));
    out.push({ i, from, to, amount: Math.max(1, amount) });
  }
  return out;
}

/** Minimum opening balance per bank so that every payment settles on arrival (gross, no queue). */
export function rtgsNeed(nBanks: number, ps: Payment[]) {
  const bal = new Array(nBanks).fill(0);
  const need = new Array(nBanks).fill(0);
  for (const p of ps) {
    bal[p.from] -= p.amount;
    bal[p.to] += p.amount;
    if (-bal[p.from] > need[p.from]) need[p.from] = -bal[p.from];
  }
  return need as number[];
}

/** Net position per bank at the end of the cycle (positive = net receiver). */
export function netPositions(nBanks: number, ps: Payment[]) {
  const net = new Array(nBanks).fill(0);
  for (const p of ps) {
    net[p.from] -= p.amount;
    net[p.to] += p.amount;
  }
  return net as number[];
}

export type RtgsRun = {
  rejected: number;
  rejectedValue: number;
  /** balance path per bank: [paymentIndex, balance] */
  paths: [number, number][][];
};

/** Run gross settlement with given opening balances: payments without funds are rejected (AM04), not queued. */
export function runRtgs(nBanks: number, ps: Payment[], opening: number[]): RtgsRun {
  const bal = opening.slice();
  const paths: [number, number][][] = bal.map((b) => [[0, b]]);
  let rejected = 0;
  let rejectedValue = 0;
  ps.forEach((p, k) => {
    if (bal[p.from] >= p.amount) {
      bal[p.from] -= p.amount;
      bal[p.to] += p.amount;
      paths[p.from].push([k + 1, bal[p.from]]);
      paths[p.to].push([k + 1, bal[p.to]]);
    } else {
      rejected++;
      rejectedValue += p.amount;
    }
  });
  paths.forEach((pt, b) => pt.push([ps.length, bal[b]]));
  return { rejected, rejectedValue, paths };
}

/** DNS unwind: if `failed` cannot pay its net debit, all its payments are removed and positions recomputed. */
export function unwind(nBanks: number, ps: Payment[], failed: number) {
  const kept = ps.filter((p) => p.from !== failed && p.to !== failed);
  return { kept, net: netPositions(nBanks, kept) };
}
