import { rng } from "@/lib/random";

/** Manual de Tempos do Pix v7.0: SLA targets for the settlement cycle (t0' … t6a). */
export type Hop = { key: string; label: string; span: string; median: number; tail: number; tailPct: 95 | 99; target?: string; owner: string };

export const HOPS: Hop[] = [
  { key: "payer", label: "Payer PSP: auth + build pacs.008", span: "t1 − t0'", median: 0.9, tail: 1.5, tailPct: 95, target: "p50 0.9 s · p95 1.5 s", owner: "payer PSP" },
  { key: "spiIn", label: "SPI: validate, deliver pacs.008", span: "t2 − t1'", median: 1.4, tail: 2.3, tailPct: 99, target: "SPI total p50 2.8 s · p99 4.6 s", owner: "BCB" },
  { key: "recv", label: "Receiver PSP: credit + pacs.002", span: "t3' − t2", median: 1.4, tail: 2.3, tailPct: 95, target: "p50 1.4 s · p95 2.3 s", owner: "receiver PSP" },
  { key: "spiOut", label: "SPI: settle, deliver pacs.002", span: "t5a − t3'", median: 1.4, tail: 2.3, tailPct: 99, target: "(half of SPI total)", owner: "BCB" },
  { key: "notify", label: "Payer PSP: consume + notify user", span: "t6a − t5a", median: 0.5, tail: 1.2, tailPct: 95, target: "no own ANS (assumed)", owner: "payer PSP" },
];

const Z = { 95: 1.645, 99: 2.326 } as const;

export function simulateBudget(hops: Hop[], n: number, seed: number, slowRecvPct: number) {
  const r = rng(seed);
  const totals: number[] = [];
  let timeouts = 0;
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (const h of hops) {
      const sigma = Math.max(0.01, Math.log(h.tail / h.median) / Z[h.tailPct]);
      let x = h.median * Math.exp(r.normal(0, sigma));
      if (h.key === "recv" && r.next() < slowRecvPct / 100) x += r.uniform(8, 45);
      t += x;
    }
    if (t > 40) timeouts++;
    totals.push(Math.min(t, 40));
  }
  const sorted = [...totals].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { totals, p50: q(0.5), p99: q(0.99), timeouts };
}

export function histogram(xs: number[], max: number, bins: number) {
  const h = new Array(bins).fill(0) as number[];
  for (const x of xs) h[Math.min(bins - 1, Math.floor((x / max) * bins))]++;
  return h;
}

export const CATEGORIES = [
  { c: "A", share: "> 2.0% of SPI transactions", target: 99.5 },
  { c: "B", share: "0.5% – 2.0%", target: 99.0 },
  { c: "C", share: "0.1% – 0.5%", target: 98.5 },
  { c: "D", share: "others", target: 95.0 },
] as const;
