// Cobrança com vencimento (cobv) final-value calculation — Manual de Padrões v2.10.0, Anexo III §4.
// Vf = Vo − Va − Vd + Vj + Vm. All money in integer cents; truncation (not rounding) as the Manual prescribes.

export type Day = number; // days since 1970-01-01 (UTC)

export const toDay = (iso: string): Day => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
export const fromDay = (d: Day): string => new Date(d * 86400000).toISOString().slice(0, 10);
export const weekday = (d: Day) => (d + 4) % 7; // 0 = Sunday (1970-01-01 was a Thursday)
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isBusiness(d: Day, holidays: Set<Day>) {
  const w = weekday(d);
  return w !== 0 && w !== 6 && !holidays.has(d);
}
export function nextBusiness(d: Day, holidays: Set<Day>): Day {
  let x = d;
  while (!isBusiness(x, holidays)) x++;
  return x;
}
/** business days in (a, b] — the count used for "dias úteis" differences */
export function businessBetween(a: Day, b: Day, holidays: Set<Day>): number {
  let n = 0;
  for (let d = a + 1; d <= b; d++) if (isBusiness(d, holidays)) n++;
  return n;
}

export type CobvParams = {
  original: number; // cents
  due: string; // dataDeVencimento
  validade: number; // validadeAposVencimento (calendar days)
  abatMod: 0 | 1 | 2; // 0 none, 1 fixed, 2 percent
  abatVal: number; // cents or hundredths of %
  descMod: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  descFixed: { date: string; val: number }[]; // mod 1/2 (≤3)
  descVal: number; // mod 3–6 (cents/day or hundredths of %/day)
  jurosMod: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  jurosVal: number; // cents/day or hundredths of %
  multaMod: 0 | 1 | 2;
  multaVal: number; // cents or hundredths of %
};

export type CobvResult = {
  payable: boolean;
  dueAdj: Day;
  lastDay: Day;
  va: number;
  vd: number;
  vj: number;
  vm: number;
  vf: number;
  dc: number; // days late (calendar), from adjusted due
  du: number; // days late (business)
  ac: number; // days early (calendar), from original due
  au: number; // days early (business)
  jurosFactor?: number; // micro-units (6 decimals)
  why: string[];
};

const pct = (base: number, hundredths: number) => Math.floor((base * hundredths) / 10000);

export function computeCobv(p: CobvParams, payDate: string, holidays: Set<Day>): CobvResult {
  const why: string[] = [];
  const due = toDay(p.due);
  const dueAdj = nextBusiness(due, holidays);
  const lastDay = nextBusiness(due + p.validade, holidays);
  const pay = toDay(payDate);
  const payable = pay <= lastDay;
  if (dueAdj !== due) why.push(`Due date ${p.due} is not a business day for the payer → extended to ${fromDay(dueAdj)}.`);

  const vo = p.original;
  // Abatimento
  const va = p.abatMod === 1 ? p.abatVal : p.abatMod === 2 ? pct(vo, p.abatVal) : 0;
  const base = vo - va;

  // Early / late day counts
  const ac = Math.max(0, due - pay); // calendar days of anticipation use the ORIGINAL due date
  const au = pay < dueAdj ? businessBetween(pay, dueAdj, holidays) : 0;
  const dc = Math.max(0, pay - dueAdj);
  const du = pay > dueAdj ? businessBetween(dueAdj, pay, holidays) : 0;

  // Desconto
  let vd = 0;
  if (p.descMod === 1 || p.descMod === 2) {
    const sorted = [...p.descFixed].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
    for (const el of sorted) {
      const lim = nextBusiness(toDay(el.date), holidays);
      if (pay <= lim) {
        vd = p.descMod === 1 ? el.val : pct(base, el.val);
        why.push(`Paid on/before ${fromDay(lim)}${lim !== toDay(el.date) ? ` (${el.date} extended)` : ""} → desconto element ${el.date}.`);
        break;
      }
    }
  } else if (p.descMod >= 3) {
    const da = p.descMod === 3 || p.descMod === 5 ? ac : au;
    vd = p.descMod <= 4 ? p.descVal * da : Math.floor((base * p.descVal * da) / 10000);
    if (da > 0) why.push(`${da} ${p.descMod === 3 || p.descMod === 5 ? "calendar" : "business"} day(s) of anticipation.`);
  }
  vd = Math.min(vd, base);

  // Juros
  let vj = 0;
  let jurosFactor: number | undefined;
  if (p.jurosMod) {
    const corridos = p.jurosMod <= 4;
    const da = corridos ? dc : du;
    if (p.jurosMod === 1 || p.jurosMod === 5) vj = p.jurosVal * da;
    else {
      const n = corridos ? [1, 30, 360][p.jurosMod - 2] : [1, 21, 252][p.jurosMod - 6];
      // factor = (Ij/100)/n × Dα, truncated to 6 decimals → micro-units
      jurosFactor = Math.floor((p.jurosVal * da * 100) / n);
      vj = Math.floor((base * jurosFactor) / 1_000_000);
    }
    if (da > 0) why.push(`${da} ${corridos ? "calendar" : "business"} day(s) late → juros.`);
  }

  // Multa: k = 1 if any lateness
  let vm = 0;
  const late = (p.jurosMod >= 5 ? du : dc) > 0; // k(Dα) = 0 or 1
  if (p.multaMod && late) vm = p.multaMod === 1 ? p.multaVal : pct(base, p.multaVal);

  const vf = vo - va - vd + vj + vm;
  if (!payable) why.push(`After ${fromDay(lastDay)} (due + ${p.validade} days, extended to a business day) the charge can no longer be paid.`);
  return { payable, dueAdj, lastDay, va, vd, vj, vm, vf, dc, du, ac, au, jurosFactor, why };
}

export const brl = (cents: number) => (cents / 100).toFixed(2);
