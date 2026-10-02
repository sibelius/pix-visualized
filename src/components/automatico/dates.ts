/** Calendar helpers on integer "day numbers" (days since 1970-01-01, UTC). Pure and deterministic. */

export type Day = number;

export const day = (y: number, m: number, d: number): Day => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);

export function ymd(n: Day): { y: number; m: number; d: number; dow: number } {
  const dt = new Date(n * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}

const p2 = (x: number) => String(x).padStart(2, "0");

/** 2026-11-15 */
export const iso = (n: Day) => {
  const { y, m, d } = ymd(n);
  return `${y}-${p2(m)}-${p2(d)}`;
};
/** 20261115 */
export const compact = (n: Day) => iso(n).replaceAll("-", "");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Mon 16 Nov" */
export const pretty = (n: Day) => {
  const { m, d, dow } = ymd(n);
  return `${DOW[dow]} ${d} ${MON[m - 1]}`;
};
export const short = (n: Day) => {
  const { m, d } = ymd(n);
  return `${d} ${MON[m - 1]}`;
};

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * National bank holidays (fixed + Easter-based) for 2026–2027. Carnival Monday/Tuesday are not legal holidays but banks
 * do not open, so they are treated as non-business days here. Local (municipal) holidays — which the receiver PSP must
 * also honour, using the payer's codMunIBGE from the pain.012 — are left out of this model.
 */
const HOLIDAYS: Record<string, string> = {
  "2026-01-01": "Confraternização",
  "2026-02-16": "Carnaval",
  "2026-02-17": "Carnaval",
  "2026-04-03": "Sexta-feira Santa",
  "2026-04-21": "Tiradentes",
  "2026-05-01": "Dia do Trabalho",
  "2026-06-04": "Corpus Christi",
  "2026-09-07": "Independência",
  "2026-10-12": "N. Sra. Aparecida",
  "2026-11-02": "Finados",
  "2026-11-15": "Proclamação da República",
  "2026-11-20": "Consciência Negra",
  "2026-12-25": "Natal",
  "2027-01-01": "Confraternização",
  "2027-02-08": "Carnaval",
  "2027-02-09": "Carnaval",
  "2027-03-26": "Sexta-feira Santa",
  "2027-04-21": "Tiradentes",
  "2027-05-01": "Dia do Trabalho",
  "2027-05-27": "Corpus Christi",
  "2027-09-07": "Independência",
};

export const holiday = (n: Day): string | undefined => HOLIDAYS[iso(n)];
export const isBusinessDay = (n: Day) => {
  const { dow } = ymd(n);
  return dow !== 0 && dow !== 6 && !holiday(n);
};
export const nextBusinessDay = (n: Day) => {
  let x = n;
  while (!isBusinessDay(x)) x++;
  return x;
};

export type Periodicidade = "SEMANAL" | "MENSAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";

/**
 * Start of cycle k (k = 0 is the first payment date). Monthly-type periods keep the day of month of the first payment;
 * when that day does not exist in the target month, the cycle starts on the last existing day before it (Guia de
 * Implementação do Pix Automático, "Ciclo": 30/dec → 30/jan → 28/feb → 30/mar ...).
 */
export function cycleStart(first: Day, per: Periodicidade, k: number): Day {
  if (per === "SEMANAL") return first + 7 * k;
  const months = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }[per] * k;
  const { y, m, d } = ymd(first);
  const t = m - 1 + months;
  const ty = y + Math.floor(t / 12);
  const tm = (t % 12) + 1;
  return day(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}
