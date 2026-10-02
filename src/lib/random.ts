/** Seeded PRNG (mulberry32) so simulations are reproducible and resettable. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** uniform in [min, max) */
    uniform: (min: number, max: number) => min + (max - min) * next(),
    int: (min: number, max: number) => Math.floor(min + (max - min + 1) * next()),
    /** exponential with the given mean */
    exp: (mean: number) => -Math.log(1 - next()) * mean,
    /** normal via Box–Muller */
    normal: (mean = 0, sd = 1) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    bernoulli: (p: number) => next() < p,
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
  };
}

export type Rng = ReturnType<typeof rng>;

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
export const fmt = (x: number, d = 0) =>
  Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "∞";
export const money = (x: number) =>
  (x < 0 ? "-$" : "$") +
  (Math.abs(x) >= 1e6 ? `${fmt(Math.abs(x) / 1e6, 1)}M` : Math.abs(x) >= 1e3 ? `${fmt(Math.abs(x) / 1e3, 0)}k` : fmt(Math.abs(x)));
