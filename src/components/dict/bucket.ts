/**
 * DICT getEntry anti-scan token buckets (API DICT v2.12 + Manual Operacional do DICT v8.5 §13.1).
 *
 *  - ENTRIES_READ_USER_ANTISCAN     (USER scope, EMAIL/PHONE keys)
 *  - ENTRIES_READ_USER_ANTISCAN_V2  (USER scope, CPF/CNPJ/EVP keys)
 *      PF: capacity 100, +2/min;  PJ: capacity 1,000, +20/min
 *      200 → −1, 404 → −20, payment order sent (matching EndToEndId) → +1 (PF) / +2 (PJ)
 *  - ENTRIES_READ_PARTICIPANT_ANTISCAN (PSP scope, all key types)
 *      capacity / refill by BCB category A–H; 200 → −1, 404 → −3, payment → +1
 *
 * A request is answered 429 when the bucket is empty; a request that is let
 * through can push the balance below zero (a 404 at 5 tokens leaves −15).
 */
import { rng, type Rng } from "@/lib/random";

export type Owner = "PF" | "PJ";
export type Category = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export const USER_POLICY: Record<Owner, { cap: number; perMin: number; credit: number }> = {
  PF: { cap: 100, perMin: 2, credit: 1 },
  PJ: { cap: 1000, perMin: 20, credit: 2 },
};

export const PARTICIPANT_POLICY: Record<Category, { cap: number; perMin: number }> = {
  A: { cap: 50000, perMin: 25000 },
  B: { cap: 40000, perMin: 20000 },
  C: { cap: 30000, perMin: 15000 },
  D: { cap: 16000, perMin: 8000 },
  E: { cap: 5000, perMin: 2500 },
  F: { cap: 500, perMin: 250 },
  G: { cap: 250, perMin: 25 },
  H: { cap: 50, perMin: 2 },
};

export const COST = { userFound: 1, userMiss: 20, partFound: 1, partMiss: 3 };

export type Params = {
  owner: Owner;
  category: Category;
  /** focal user's lookups per minute */
  rate: number;
  /** share of lookups that hit a registered key (200) */
  found: number;
  /** share of found lookups that end in a payment order */
  paid: number;
  /** share of lookups on EMAIL/PHONE keys (rest: CPF/CNPJ/EVP) */
  phoneShare: number;
  /** other users' lookups per minute at the same PSP */
  background: number;
  /** PSP mirrors the buckets and refuses locally before the DICT says 429 (Manual §13.2.2) */
  precheck: boolean;
};

export type Sample = { t: number; a: number; b: number; p: number };

export type Sim = {
  r: Rng;
  t: number; // seconds
  a: number; // user bucket EMAIL/PHONE
  b: number; // user bucket CPF/CNPJ/EVP
  p: number; // participant bucket
  pending: { at: number; bucket: "a" | "b" }[];
  sent: number;
  ok: number;
  miss: number;
  limited: number;
  local: number;
  payments: number;
  samples: Sample[];
  hits429: { t: number; y: number; which: "a" | "b" | "p" }[];
  owner: Owner;
  category: Category;
};

export function init(owner: Owner, category: Category, seed = 7): Sim {
  const u = USER_POLICY[owner].cap;
  const p = PARTICIPANT_POLICY[category].cap;
  return {
    r: rng(seed),
    t: 0,
    a: u,
    b: u,
    p,
    pending: [],
    sent: 0,
    ok: 0,
    miss: 0,
    limited: 0,
    local: 0,
    payments: 0,
    samples: [{ t: 0, a: u, b: u, p }],
    hits429: [],
    owner,
    category,
  };
}

/** advance one simulated second */
export function step(s: Sim, P: Params) {
  const U = USER_POLICY[s.owner];
  const C = PARTICIPANT_POLICY[s.category];
  s.t += 1;

  // periodic refill (continuous approximation of "N tokens per minute")
  s.a = Math.min(U.cap, s.a + U.perMin / 60);
  s.b = Math.min(U.cap, s.b + U.perMin / 60);
  s.p = Math.min(C.cap, s.p + C.perMin / 60);

  // other users of the same PSP: an honest mix (98% found, 92% of those paid)
  const bg = P.background / 60;
  s.p += bg * (0.98 * 0.92 * 1 - 0.98 * COST.partFound - 0.02 * COST.partMiss);
  s.p = Math.min(C.cap, s.p);

  // payment orders landing: the SPI settles the pacs.008 carrying the lookup's EndToEndId
  const due = s.pending.filter((x) => x.at <= s.t);
  if (due.length) {
    s.pending = s.pending.filter((x) => x.at > s.t);
    for (const d of due) {
      if (d.bucket === "a") s.a = Math.min(U.cap, s.a + U.credit);
      else s.b = Math.min(U.cap, s.b + U.credit);
      s.p = Math.min(C.cap, s.p + 1);
      s.payments++;
    }
  }

  // focal user's lookups this second (Poisson-ish via bernoulli per sub-slot)
  const lam = P.rate / 60;
  let n = Math.floor(lam);
  if (s.r.bernoulli(lam - n)) n++;
  for (let i = 0; i < n; i++) {
    const bucket: "a" | "b" = s.r.bernoulli(P.phoneShare) ? "a" : "b";
    const tokens = bucket === "a" ? s.a : s.b;
    if (P.precheck && (tokens < 1 || s.p < 1)) {
      s.local++;
      continue;
    }
    s.sent++;
    if (tokens < 1 || s.p < 1) {
      s.limited++;
      s.hits429.push({ t: s.t / 60, y: tokens < 1 ? tokens : s.p, which: tokens < 1 ? bucket : "p" });
      if (s.hits429.length > 80) s.hits429.shift();
      continue;
    }
    const found = s.r.bernoulli(P.found);
    const cost = found ? COST.userFound : COST.userMiss;
    if (bucket === "a") s.a -= cost;
    else s.b -= cost;
    s.p -= found ? COST.partFound : COST.partMiss;
    if (found) {
      s.ok++;
      if (s.r.bernoulli(P.paid)) s.pending.push({ at: s.t + 20 + s.r.int(0, 60), bucket });
    } else s.miss++;
  }

  if (s.t % 5 === 0) {
    s.samples.push({ t: s.t, a: s.a, b: s.b, p: s.p });
    if (s.samples.length > 2400) s.samples.shift();
  }
}
