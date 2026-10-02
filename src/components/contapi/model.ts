import { rng } from "@/lib/random";

/* ────────────────────────────────────────────────────────────────────────────
 * 1. A week of a Conta PI: 24/7 Pix flows vs. STR business hours.
 * Times are minutes from Monday 00:00 (Brasília time). STR regular hours are
 * 06:30–18:30 BRT on business days, plus the additional aporte-only window
 * until 19:00 (Res. BCB 105, art. 18 §8). Pix settles every minute of the year.
 * ──────────────────────────────────────────────────────────────────────────── */

export const WEEK_MIN = 8 * 1440; // Mon 00:00 → next Tue 00:00
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];

/** relative Pix volume by hour of day (BRT): quiet at night, peak late morning to evening */
const HOURLY = [0.18, 0.12, 0.08, 0.06, 0.06, 0.1, 0.25, 0.45, 0.7, 0.88, 0.97, 1, 1, 0.96, 0.93, 0.92, 0.94, 0.97, 1, 0.98, 0.9, 0.75, 0.55, 0.32];

export type WeekParams = {
  /** gross outgoing volume at peak, R$ millions per hour */
  peak: number;
  /** net imbalance: outflow = gross·(1+imb), inflow = gross·(1−imb) */
  imb: number;
  /** target balance kept in the Conta PI during STR hours, R$ M */
  target: number;
  /** extra pre-funding loaded before a closure (weekend / holiday), R$ M */
  buffer: number;
  /** limite mínimo de saldo operacional, R$ M (Res. BCB 554) */
  minOp: number;
  autoBlock: boolean;
  /** minutes until treasury unblocks the account in SPB-Web after an automatic block */
  unblockAfter: number;
  holidayMonday: boolean;
  sweep: boolean;
  seed: number;
};

export type Transfer = { t: number; kind: "LPI0001" | "LPI0003" | "LPI0006"; amount: number; why: string };
export type WeekPoint = { t: number; bal: number; rej: number; blocked: boolean };
export type WeekResult = {
  points: WeekPoint[];
  transfers: Transfer[];
  rejectedValue: number;
  rejectedMinutes: number;
  rejByHour: { t: number; value: number }[];
  minBal: number;
  minBalAt: number;
  blockedMinutes: number;
  blocks: { from: number; to: number }[];
  aportes: number;
  retiradas: number;
};

export const isBusiness = (day: number, holidayMonday: boolean) => day < 5 || (day === 7 && !holidayMonday) || day >= 8;
export const strOpen = (t: number, hm: boolean) => {
  const d = Math.floor(t / 1440);
  const m = t % 1440;
  return isBusiness(d, hm) && m >= 390 && m < 1110;
};
export const aporteWindow = (t: number, hm: boolean) => {
  const d = Math.floor(t / 1440);
  const m = t % 1440;
  return isBusiness(d, hm) && m >= 1110 && m < 1140;
};
/** is the next calendar day a non-business day? (then today's STR close starts a gap) */
const closureAhead = (d: number, hm: boolean) => isBusiness(d, hm) && !isBusiness(d + 1, hm);

export function simulateWeek(p: WeekParams): WeekResult {
  const r = rng(p.seed);
  let bal = p.target;
  let blockedUntil = -1;
  const points: WeekPoint[] = [];
  const transfers: Transfer[] = [];
  const rejByHour = new Map<number, number>();
  let rejectedValue = 0;
  let rejectedMinutes = 0;
  let minBal = bal;
  let minBalAt = 0;
  let blockedMinutes = 0;
  const blocks: { from: number; to: number }[] = [];
  let bucketRej = 0;
  let bucketMin = bal;
  let bucketBlocked = false;
  let aportes = 0;
  let retiradas = 0;

  for (let t = 0; t < WEEK_MIN; t++) {
    const d = Math.floor(t / 1440);
    const m = t % 1440;
    const h = Math.floor(m / 60);
    const ahead = closureAhead(d, p.holidayMonday);
    const goal = p.target + (ahead && m >= 1110 ? p.buffer : 0);

    // treasury: liquidity transfers through the STR (LPI0001 in, LPI0003 out)
    if (strOpen(t, p.holidayMonday)) {
      if (m === 390 && bal < goal) {
        transfers.push({ t, kind: "LPI0001", amount: goal - bal, why: "STR opening top-up" });
        aportes += goal - bal;
        bal = goal;
      } else if (bal < 0.4 * goal) {
        transfers.push({ t, kind: "LPI0001", amount: goal - bal, why: "below 40% of target" });
        aportes += goal - bal;
        bal = goal;
      } else if (p.sweep && !ahead && m === 1100 && bal > goal * 1.05) {
        transfers.push({ t, kind: "LPI0003", amount: bal - goal, why: "sweep excess back to Reservas" });
        retiradas += bal - goal;
        bal = goal;
      }
    } else if (aporteWindow(t, p.holidayMonday) && ahead && m === 1111 && bal < goal) {
      // automatic aporte configured with LPI0005, executed right after the regular close (reported by LPI0006)
      transfers.push({ t, kind: "LPI0006", amount: goal - bal, why: "automatic aporte after STR close (LPI0005 config)" });
      aportes += goal - bal;
      bal = goal;
    } else if (aporteWindow(t, p.holidayMonday) && m === 1130 && bal < goal) {
      // 18:50: last chance, aporte-only window
      transfers.push({ t, kind: "LPI0001", amount: goal - bal, why: "last call (aporte window)" });
      aportes += goal - bal;
      bal = goal;
    }

    // Pix: 24/7 gross flows with noise
    const weekend = !isBusiness(d, p.holidayMonday) ? 0.8 : 1;
    const gross = (p.peak / 60) * HOURLY[h] * weekend;
    const nOut = Math.max(0, r.normal(1, 0.5));
    const nIn = Math.max(0, r.normal(1, 0.5));
    const out = gross * (1 + p.imb) * nOut;
    const inn = gross * (1 - p.imb) * nIn;

    const blocked = t < blockedUntil;
    let accepted: number;
    if (blocked) {
      accepted = 0;
      blockedMinutes++;
    } else {
      // incoming and outgoing interleave within the minute; on average half the inflow lands first
      const avail = Math.max(0, bal + inn * 0.5 - p.minOp);
      accepted = Math.min(out, avail);
    }
    const rej = out - accepted;
    bal = bal + inn - accepted;
    if (rej > 1e-9) {
      rejectedValue += rej;
      rejectedMinutes++;
      const hk = Math.floor(t / 60);
      rejByHour.set(hk, (rejByHour.get(hk) ?? 0) + rej);
      if (!blocked && p.autoBlock && p.minOp > 0) {
        blockedUntil = t + p.unblockAfter;
        blocks.push({ from: t, to: Math.min(WEEK_MIN, blockedUntil) });
      }
    }
    if (bal < minBal) {
      minBal = bal;
      minBalAt = t;
    }
    bucketRej += rej;
    bucketMin = Math.min(bucketMin, bal);
    bucketBlocked = bucketBlocked || blocked;
    if (t % 10 === 9) {
      points.push({ t: t - 9, bal: bucketMin, rej: bucketRej, blocked: bucketBlocked });
      bucketRej = 0;
      bucketMin = bal;
      bucketBlocked = false;
    }
  }
  return {
    points,
    transfers,
    rejectedValue,
    rejectedMinutes,
    rejByHour: [...rejByHour.entries()].map(([k, v]) => ({ t: k * 60, value: v })),
    minBal,
    minBalAt,
    blockedMinutes,
    blocks,
    aportes,
    retiradas,
  };
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const weekLabel = (t: number) => `${DAYS[Math.floor(t / 1440)]} ${hhmm(t % 1440)}`;

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Calendar: accounting date (data contábil), Res. BCB 195 art. 43.
 * Brasília has no DST since 2019, so BRT = UTC−3 all year.
 * ──────────────────────────────────────────────────────────────────────────── */

const pad2 = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** Gregorian Easter (anonymous algorithm), returned as a UTC date */
export function easter(y: number) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}

/** National non-business days for the financial market (simplified: national holidays + Carnival Mon/Tue). */
export function holidays(y: number): Map<string, string> {
  const e = easter(y);
  const DAY = 86400000;
  const out = new Map<string, string>();
  const add = (ms: number, name: string) => out.set(isoDate(new Date(ms)), name);
  add(Date.UTC(y, 0, 1), "Confraternização Universal");
  add(e - 48 * DAY, "Carnaval (Monday)");
  add(e - 47 * DAY, "Carnaval (Tuesday)");
  add(e - 2 * DAY, "Sexta-feira Santa");
  add(Date.UTC(y, 3, 21), "Tiradentes");
  add(Date.UTC(y, 4, 1), "Dia do Trabalho");
  add(e + 60 * DAY, "Corpus Christi");
  add(Date.UTC(y, 8, 7), "Independência");
  add(Date.UTC(y, 9, 12), "N. Sra. Aparecida");
  add(Date.UTC(y, 10, 2), "Finados");
  add(Date.UTC(y, 10, 15), "Proclamação da República");
  add(Date.UTC(y, 10, 20), "Consciência Negra");
  add(Date.UTC(y, 11, 25), "Natal");
  return out;
}

const HOL = new Map<number, Map<string, string>>();
const hol = (y: number) => {
  if (!HOL.has(y)) HOL.set(y, holidays(y));
  return HOL.get(y)!;
};

/** calendar date in Brasília for a UTC instant (as a Date at 00:00 UTC of that date) */
export const brtDate = (utcMs: number) => {
  const b = new Date(utcMs - 3 * 3600000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
};
export const isBusinessDate = (d: Date) => {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !hol(d.getUTCFullYear()).has(isoDate(d));
};
export const holidayName = (d: Date) => hol(d.getUTCFullYear()).get(isoDate(d));
export const nextBusiness = (d: Date) => {
  let c = new Date(d.getTime() + 86400000);
  while (!isBusinessDate(c)) c = new Date(c.getTime() + 86400000);
  return c;
};
/** art. 43: settlement on a business day → that Brasília calendar date; otherwise the next business day */
export const accountingDate = (utcMs: number) => {
  const d = brtDate(utcMs);
  return isBusinessDate(d) ? d : nextBusiness(d);
};
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Conta PI remuneration (Res. BCB 195, arts. 23-A and 24-A, as amended by Res. 412/2024)
 * R = S × [(1 + Selic)^(1/252) − 1], partial results with 8 decimals, R with 2.
 * ──────────────────────────────────────────────────────────────────────────── */

const round = (v: number, d: number) => {
  const f = 10 ** d;
  return Math.round((v + Number.EPSILON * Math.sign(v)) * f) / f;
};

export function remuneration(balance: number, selicPct: number, eMoney: number, vsrAvg: number) {
  const vsme = round(0.5 * eMoney, 2);
  const vvsr = round(0.2 * vsrAvg, 2);
  const cap = Math.max(600_000_000, vsme + vvsr);
  const S = Math.min(balance, cap);
  const selic = round(selicPct / 100, 4);
  const onePlus = round(1 + selic, 8);
  const exp = round(1 / 252, 8);
  const pow = round(onePlus ** exp, 8);
  const factor = round(pow - 1, 8);
  const R = round(S * factor, 2);
  return { vsme, vvsr, cap, S, selic, onePlus, exp, pow, factor, R, capBinds: balance > cap };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Reconciliation: internal ledger vs. the SPI's relação de lançamentos (REL).
 * ──────────────────────────────────────────────────────────────────────────── */

export type RelRow = {
  valor: number;
  creditoOuDebito: "CRDT" | "DBIT";
  situacao: "BOOK" | "INFO";
  dataContabil: string;
  dataHoraSituacao: string;
  idInstrucao?: string;
  idFimAFim: string;
  numeroControleSTR?: string;
  nomeMensagemOrigem: string;
  participanteDoUsuarioPagador?: string;
  participanteDoUsuarioRecebedor?: string;
};

export type LedgerRow = {
  id: string;
  e2e: string;
  rtrId?: string;
  dir: "CRDT" | "DBIT";
  amount: number;
  kind: "pacs.008" | "pacs.004" | "LPI0001";
  state: "settled" | "pending";
};

export type Verdict = "match" | "missed-pacs002" | "rejected-not-reversed" | "duplicate" | "missing-in-ledger" | "never-reached-spi" | "amount-mismatch";

export const VERDICTS: { value: Verdict; label: string; action: string }[] = [
  { value: "match", label: "match", action: "Nothing to do." },
  { value: "missed-pacs002", label: "pacs.002 missed", action: "SPI settled it but your ledger still says pending: you lost (or never consumed) the pacs.002. Mark settled; then fix the consumer." },
  { value: "rejected-not-reversed", label: "rejected, not reversed", action: "SPI shows INFO (not settled, e.g. AM04/AB03) but you debited the customer. Credit the customer back." },
  { value: "duplicate", label: "duplicate booking", action: "The same operation is booked twice (a redelivered message processed again). Reverse one; dedupe on EndToEndId / RtrId." },
  { value: "missing-in-ledger", label: "missing in ledger", action: "A booked Conta PI entry you never recorded (credit or return). Book it to the right customer, investigate the consumer." },
  { value: "never-reached-spi", label: "never reached SPI", action: "Your ledger has it, the SPI has no entry at all: the message was never stored (4xx/5xx at ICOM). Resend (idempotent) or reverse." },
  { value: "amount-mismatch", label: "amount mismatch", action: "Same key, different value. Usually a bug in a partial devolução or fee logic. Investigate before touching balances." },
];

export type ReconRow = { key: string; ledger: LedgerRow[]; rel?: RelRow; truth: Verdict };

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const randStr = (r: ReturnType<typeof rng>, n: number, chars = ALNUM) => Array.from({ length: n }, () => chars[Math.floor(r.next() * chars.length)]).join("");

export const ME = "12345678"; // our ISPB (fictional)
const OTHERS = ["87654321", "11223344", "99887766", "55443322"];

export function e2eFor(r: ReturnType<typeof rng>, ispb: string, yyyymmdd: string, hhmmStr: string) {
  return `E${ispb}${yyyymmdd}${hhmmStr}${randStr(r, 11)}`;
}

export function reconRound(seed: number) {
  const r = rng(seed);
  const date = "2026-10-02";
  const ymd = "20261002";
  const rows: ReconRow[] = [];
  const anomalies: Verdict[] = ["missed-pacs002", "rejected-not-reversed", "duplicate", "missing-in-ledger", "never-reached-spi", "amount-mismatch"];
  // pick 4 distinct anomalies
  const pool = [...anomalies];
  const chosen: Verdict[] = [];
  while (chosen.length < 4) chosen.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]);
  const plan: Verdict[] = [...chosen, ...Array.from({ length: 8 }, () => "match" as Verdict)];
  // shuffle
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  const lpiAt = plan.indexOf("match");
  let minute = 12 * 60 + 2;
  plan.forEach((v, i) => {
    minute += r.int(1, 9);
    const hh = String(Math.floor(minute / 60) + 3).padStart(2, "0"); // UTC = BRT+3
    const mm = String(minute % 60).padStart(2, "0");
    const ts = `${date}T${hh}:${mm}:${String(r.int(0, 59)).padStart(2, "0")}.${String(r.int(0, 999)).padStart(3, "0")}Z`;
    const kindRoll = r.next();
    const outgoingOnly = v === "rejected-not-reversed" || v === "missed-pacs002" || v === "never-reached-spi";
    const kind: LedgerRow["kind"] = outgoingOnly ? "pacs.008" : i === lpiAt ? "LPI0001" : kindRoll < 0.18 ? "pacs.004" : "pacs.008";
    const dirRoll = r.next();
    const dir: "CRDT" | "DBIT" = outgoingOnly ? "DBIT" : kind === "LPI0001" ? "CRDT" : dirRoll < 0.5 ? "DBIT" : "CRDT";
    const other = r.pick(OTHERS);
    // pacs.008: EndToEndId starts with the payer's ISPB. pacs.004: the original E2E is from the original payer,
    // the RtrId (D…) from whoever sends the return.
    const origPayer = kind === "pacs.004" ? (dir === "DBIT" ? other : ME) : dir === "DBIT" ? ME : other;
    const e2e = kind === "LPI0001" ? `L00038166${ymd}${hh}${mm}${randStr(r, 11)}` : e2eFor(r, origPayer, ymd, `${hh}${mm}`);
    const rtrId = kind === "pacs.004" ? `D${dir === "DBIT" ? ME : other}${ymd}${hh}${mm}${randStr(r, 11)}` : undefined;
    const amount = kind === "LPI0001" ? 5_000_000 : Math.round(r.exp(380) * 100 + 500) / 100;
    const rel: RelRow = {
      valor: amount,
      creditoOuDebito: dir,
      situacao: "BOOK",
      dataContabil: `${date}T00:00:00.000Z`,
      dataHoraSituacao: ts,
      idInstrucao: rtrId,
      idFimAFim: e2e,
      numeroControleSTR: kind === "LPI0001" ? `STR${ymd}${randStr(r, 9)}` : undefined,
      nomeMensagemOrigem: kind === "LPI0001" ? "LPI0001" : kind === "pacs.004" ? "PACS004" : "PACS008",
      participanteDoUsuarioPagador: kind === "LPI0001" ? undefined : dir === "DBIT" ? ME : other,
      participanteDoUsuarioRecebedor: kind === "LPI0001" ? undefined : dir === "DBIT" ? other : ME,
    };
    const led = (over: Partial<LedgerRow> = {}): LedgerRow => ({
      id: `L${1000 + i}${over.id ?? ""}`,
      e2e,
      rtrId,
      dir,
      amount,
      kind,
      state: "settled",
      ...over,
    });
    const k2 = `${e2e}|${rtrId ?? ""}|${dir}`;
    switch (v) {
      case "match":
        rows.push({ key: k2, ledger: [led()], rel, truth: v });
        break;
      case "missed-pacs002":
        rows.push({ key: k2, ledger: [led({ state: "pending" })], rel, truth: v });
        break;
      case "rejected-not-reversed":
        rel.situacao = "INFO";
        rel.dataContabil = "";
        rows.push({ key: k2, ledger: [led()], rel, truth: v });
        break;
      case "duplicate":
        rows.push({ key: k2, ledger: [led(), led({ id: "b" })], rel, truth: v });
        break;
      case "missing-in-ledger":
        rows.push({ key: k2, ledger: [], rel, truth: v });
        break;
      case "never-reached-spi":
        rows.push({ key: k2, ledger: [led({ state: "pending" })], rel: undefined, truth: v });
        break;
      case "amount-mismatch":
        rows.push({ key: k2, ledger: [led({ amount: Math.round(amount * 0.5 * 100) / 100 })], rel, truth: v });
        break;
    }
  });
  return rows;
}

/** The real algorithm: full outer join on (EndToEndId, RtrId, direction), then compare. */
export function reconcile(ledger: LedgerRow[], rel: RelRow[]): Map<string, Verdict> {
  const out = new Map<string, Verdict>();
  const relByKey = new Map(rel.map((x) => [`${x.idFimAFim}|${x.idInstrucao ?? ""}|${x.creditoOuDebito}`, x]));
  const ledByKey = new Map<string, LedgerRow[]>();
  for (const l of ledger) {
    const k = `${l.e2e}|${l.rtrId ?? ""}|${l.dir}`;
    ledByKey.set(k, [...(ledByKey.get(k) ?? []), l]);
  }
  const keys = new Set([...relByKey.keys(), ...ledByKey.keys()]);
  for (const k of keys) {
    const s = relByKey.get(k);
    const ls = ledByKey.get(k) ?? [];
    if (!s) out.set(k, "never-reached-spi");
    else if (!ls.length) out.set(k, s.situacao === "BOOK" ? "missing-in-ledger" : "match");
    else if (ls.length > 1) out.set(k, "duplicate");
    else if (s.situacao === "INFO") out.set(k, ls[0].state === "settled" ? "rejected-not-reversed" : "match");
    else if (Math.abs(ls[0].amount - s.valor) > 0.004) out.set(k, "amount-mismatch");
    else if (ls[0].state === "pending") out.set(k, "missed-pacs002");
    else out.set(k, "match");
  }
  return out;
}

export const REL_HEADER = [
  "participanteDireto",
  "valor",
  "creditoOuDebito",
  "situacaoDaTransacao",
  "dataContabil",
  "dataHoraSituacao",
  "IdInstrucao",
  "idFimAFim",
  "numeroControleSTR",
  "cnpjIniciadorPagamento",
  "participanteDoUsuarioPagador",
  "participanteDoUsuarioRecebedor",
  "tipoAgente",
  "ISPBOrigemLancamento",
  "nomeMensagemOrigem",
  "tipoPrioridadePagamento",
  "finalidadeDaTransacao",
];

export function relCsv(rows: RelRow[]) {
  const lines = [REL_HEADER.join(",")];
  for (const x of rows) {
    const lpi = x.nomeMensagemOrigem.startsWith("LPI");
    const pix = x.nomeMensagemOrigem === "PACS008";
    lines.push(
      [
        ME,
        x.valor.toFixed(2),
        x.creditoOuDebito,
        x.situacao,
        x.dataContabil,
        x.dataHoraSituacao,
        x.idInstrucao ?? "",
        x.idFimAFim,
        x.numeroControleSTR ?? "",
        "",
        x.participanteDoUsuarioPagador ?? "",
        x.participanteDoUsuarioRecebedor ?? "",
        lpi ? "ContraparteSTR" : "",
        lpi ? ME : "",
        x.nomeMensagemOrigem,
        pix ? "PAGPRI" : "",
        pix ? "IPAY" : "",
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Indirect participants settling in their liquidante's Conta PI (a Saturday).
 * ──────────────────────────────────────────────────────────────────────────── */

export type IndirectParams = {
  n: number; // indirect participants (1..4)
  ownBuffer: number; // provider's own money in the Conta PI, R$ M
  prefund: number; // each indirect's prefunded position at the provider, R$ M
  surge: number; // outflow multiplier of indirect B from 14:00 (a run / a fraud drain)
  enforce: boolean; // provider gates each indirect's outgoing Pix by its own position
  seed: number;
};

export const IND_NAMES = ["Provider (own clients)", "Indirect A", "Indirect B", "Indirect C", "Indirect D"];
export const IND_COLORS = ["#e879f9", "#38bdf8", "#f87171", "#34d399", "#fbbf24"];

export function simulateIndirect(p: IndirectParams) {
  const r = rng(p.seed);
  const k = p.n + 1;
  const gross = [3, 1.6, 1.2, 1, 0.8].slice(0, k); // R$ M per hour at peak
  const imb = [0.0, 0.04, 0.06, 0.02, 0.05].slice(0, k);
  const pos = [p.ownBuffer, ...Array.from({ length: p.n }, () => p.prefund)];
  let conta = pos.reduce((a, b) => a + b, 0);
  const provRej = new Array(k).fill(0);
  const spiRej = new Array(k).fill(0);
  let maxExposure = 0;
  let maxExposureAt = 0;
  const pts: { t: number; conta: number; pos: number[]; exposure: number }[] = [];
  for (let t = 0; t < 1440; t++) {
    const h = Math.floor(t / 60);
    const outs: number[] = [];
    const ins: number[] = [];
    for (let i = 0; i < k; i++) {
      const g = (gross[i] / 60) * HOURLY[h] * 0.8;
      let o = g * (1 + imb[i]) * Math.max(0, r.normal(1, 0.5));
      if (i === 2 && t >= 840) o *= p.surge;
      outs.push(o);
      ins.push(g * (1 - imb[i]) * Math.max(0, r.normal(1, 0.5)));
    }
    // 1) the provider's own gate (in its systems, before any pacs.008 reaches the SPI)
    const sent = outs.map((o, i) => {
      if (!p.enforce || i === 0) return o;
      const allowed = Math.max(0, pos[i] + ins[i] * 0.5);
      const s = Math.min(o, allowed);
      provRej[i] += o - s;
      return s;
    });
    // 2) the SPI: one Conta PI for everybody. Insufficient funds → AM04, whoever's payment it was.
    const totalSent = sent.reduce((a, b) => a + b, 0);
    const totalIn = ins.reduce((a, b) => a + b, 0);
    const avail = Math.max(0, conta + totalIn * 0.5);
    const ratio = totalSent > 0 ? Math.min(1, avail / totalSent) : 1;
    let settledOut = 0;
    for (let i = 0; i < k; i++) {
      const ok = sent[i] * ratio;
      spiRej[i] += sent[i] - ok;
      settledOut += ok;
      pos[i] += ins[i] - ok;
    }
    conta += totalIn - settledOut;
    const exposure = pos.slice(1).reduce((a, b) => a + Math.max(0, -b), 0);
    if (exposure > maxExposure) {
      maxExposure = exposure;
      maxExposureAt = t;
    }
    if (t % 10 === 0) pts.push({ t, conta, pos: [...pos], exposure });
  }
  return { pts, provRej, spiRej, maxExposure, maxExposureAt };
}
