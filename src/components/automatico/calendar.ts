/**
 * Billing-calendar engine for one monthly Pix Automático recorrência: pain.013 lead time (2–10 days), payer-PSP checks,
 * the 00h–08h settlement window, the mandatory 18h–21h intraday retry, and post-due-date retries (NTAG: ≤ 3 dates within
 * 7 days, only if politicaRetentativa = PERMITE_3R_7D). Rules from the Guia de Implementação do Pix Automático v1.3 and
 * IN BCB nº 513/2024.
 */
import { compact, cycleStart, iso, isBusinessDay, nextBusinessDay, type Day } from "./dates";
import { e2eAuto } from "./ids";

export type Funds = "0h" | "18h" | "D+1" | "D+2" | "D+3" | "D+5" | "D+7" | "never";
export const FUNDS: Funds[] = ["0h", "18h", "D+1", "D+2", "D+3", "D+5", "D+7", "never"];

export type CycleInput = { funds: Funds; payerCancel: boolean };

export type CalParams = {
  first: Day;
  cycles: number;
  fixed: boolean;
  base: number;
  /** payer's valor máximo (variable recorrências only) */
  max: number;
  /** pain.013 sent this many days before the settlement date */
  lead: number;
  ajusteDiaUtil: boolean;
  retries: boolean;
  /** NTAG offsets, in days after the original settlement date */
  retryPlan: number[];
  /** payer cancels the whole authorization right before this cycle index (or -1) */
  authCancelAt: number;
  perCycle: CycleInput[];
};

export type Ev = {
  day: Day;
  /** hour of day (Brasília) */
  h: number;
  kind: "api" | "msg" | "ok" | "fail" | "notify" | "cancel" | "info";
  text: string;
};

export type Tentativa = { date: Day; tipo: "AGND" | "NTAG"; status: "AGENDADA" | "PAGA" | "EXPIRADA" | "CANCELADA" | "REJEITADA"; e2e: string };

export type CycleOut = {
  k: number;
  nominal: Day;
  due: Day;
  nextStart: Day;
  amount: number;
  sentAt: Day | null;
  status: "CRIADA" | "ATIVA" | "CONCLUIDA" | "EXPIRADA" | "REJEITADA" | "CANCELADA" | "—";
  rejectCode?: string;
  paidOn?: Day;
  tentativas: Tentativa[];
  events: Ev[];
};

const RECEIVER_ISPB = "87654321";

/** deterministic amount per cycle for variable recorrências (a utility bill that drifts, with one spike) */
export function amountFor(p: CalParams, k: number) {
  if (p.fixed) return p.base;
  const drift = [1, 0.93, 1.08, 1.62, 0.97, 1.12, 0.9, 1.05][k % 8];
  return Math.round(p.base * drift * 100) / 100;
}

function fundsAvailable(f: Funds, due: Day, d: Day, hour: number) {
  if (f === "never") return false;
  if (f === "0h") return d >= due;
  if (f === "18h") return d > due || (d === due && hour >= 18);
  const n = Number(f.slice(2));
  return d >= due + n;
}

export function simulate(p: CalParams): CycleOut[] {
  const out: CycleOut[] = [];
  let seq = 1;
  for (let k = 0; k < p.cycles; k++) {
    const nominal = cycleStart(p.first, "MENSAL", k);
    const nextStart = cycleStart(p.first, "MENSAL", k + 1);
    const due = p.ajusteDiaUtil ? nextBusinessDay(nominal) : nominal;
    const amount = amountFor(p, k);
    const ci = p.perCycle[k] ?? { funds: "0h", payerCancel: false };
    const ev: Ev[] = [];
    const c: CycleOut = { k, nominal, due, nextStart, amount, sentAt: null, status: "—", tentativas: [], events: ev };
    out.push(c);

    if (p.authCancelAt >= 0 && k >= p.authCancelAt) {
      ev.push({ day: due - p.lead, h: 9, kind: "cancel", text: "recorrência CANCELADA (payer cancelled the authorization): the receiver can no longer send cobranças" });
      continue;
    }
    if (due !== nominal) ev.push({ day: nominal, h: 0, kind: "info", text: `${iso(nominal)} is not a business day → ajusteDiaUtil moves settlement to ${iso(due)}` });
    else if (!isBusinessDay(nominal)) ev.push({ day: nominal, h: 0, kind: "info", text: "ajusteDiaUtil = false: settles on a non-business day (receiver must have legal grounds)" });

    const sent = due - p.lead;
    c.sentAt = sent;
    ev.push({ day: sent - 1, h: 15, kind: "api", text: `POST /cobr { idRec, calendario.dataDeVencimento: ${iso(nominal)}, valor.original: ${amount.toFixed(2)}, ajusteDiaUtil: ${p.ajusteDiaUtil} } → CRIADA` });
    c.status = "CRIADA";
    const e2e0 = e2eAuto(RECEIVER_ISPB, compact(due), seq++);
    ev.push({ day: sent, h: 10, kind: "msg", text: `pain.013 AGND (PmtInfId = txid, XpryDt/Dt = vencimento ${iso(nominal)}, EndToEndId ${e2e0} dated for settlement, PAGAGD, LclInstrm AUTO) → SPI → payer PSP` });

    // payer PSP validations (within 2 h)
    if (p.lead < 2 || p.lead > 10) {
      c.status = "REJEITADA";
      c.rejectCode = "deadline";
      c.tentativas.push({ date: due, tipo: "AGND", status: "REJEITADA", e2e: e2e0 });
      ev.push({ day: sent, h: 11, kind: "fail", text: `pain.014 RJCT: instruction sent ${p.lead} day(s) before settlement — must be 2 to 10 calendar days (checked against dataHoraCriacaoParaEmissao)` });
      continue;
    }
    if (!p.fixed && amount > p.max) {
      c.status = "REJEITADA";
      c.rejectCode = "AM02";
      c.tentativas.push({ date: due, tipo: "AGND", status: "REJEITADA", e2e: e2e0 });
      ev.push({ day: sent, h: 11, kind: "fail", text: `pain.014 RJCT AM02 (NotAllowedAmount): R$ ${amount.toFixed(2)} > valor máximo R$ ${p.max.toFixed(2)}` });
      ev.push({ day: sent, h: 11, kind: "notify", text: "payer notified: debit NOT scheduled (above your maximum). The receiver may ask the payer to raise it and resend within the cycle." });
      continue;
    }
    c.status = "ATIVA";
    c.tentativas.push({ date: due, tipo: "AGND", status: "AGENDADA", e2e: e2e0 });
    ev.push({ day: sent, h: 11, kind: "ok", text: "pain.014 ACSP (≤ 2 h after the pain.013) → cobr ATIVA, tentativa AGND AGENDADA" });
    ev.push({ day: sent, h: 11, kind: "notify", text: `payer notified: R$ ${amount.toFixed(2)} scheduled for ${iso(due)} (can be disabled by the payer)` });

    if (ci.payerCancel) {
      c.status = "CANCELADA";
      c.tentativas[0].status = "CANCELADA";
      ev.push({ day: due - 1, h: 20, kind: "cancel", text: "payer cancels this debit (allowed until 23:59 of D-1) → camt.055 SLBD → receiver PSP; camt.029 within 12 h" });
      continue;
    }

    const attempt = (d: Day, t: Tentativa) => {
      if (fundsAvailable(ci.funds, due, d, 0)) {
        t.status = "PAGA";
        ev.push({ day: d, h: 0.5, kind: "ok", text: `00h–08h window: pacs.008 (canal secundário, NORM/PAGAGD, LclInstrm AUTO, EndToEndId ${t.e2e}) → pacs.002 ACSC` });
        return true;
      }
      ev.push({ day: d, h: 8, kind: "notify", text: "08:00 not settled (insufficient balance or Pix Automático limit) → payer told a new attempt happens today from 18h" });
      if (fundsAvailable(ci.funds, due, d, 18)) {
        t.status = "PAGA";
        ev.push({ day: d, h: 18.5, kind: "ok", text: "18h–21h mandatory intraday retry: pacs.008 → pacs.002 ACSC" });
        return true;
      }
      t.status = "EXPIRADA";
      ev.push({ day: d, h: 21, kind: "fail", text: "21:00 last intraday attempt failed → tentativa EXPIRADA" });
      return false;
    };

    if (attempt(due, c.tentativas[0])) {
      c.status = "CONCLUIDA";
      c.paidOn = due;
      ev.push({ day: due, h: 21, kind: "notify", text: "payer notified: paid; statement shows 'Pix Automático' with receipt" });
      continue;
    }
    if (!p.retries) {
      c.status = "EXPIRADA";
      ev.push({ day: due, h: 21, kind: "notify", text: "NAO_PERMITE (idRec starts RN…): payer told to pay this bill by other means" });
      continue;
    }
    ev.push({ day: due, h: 21, kind: "notify", text: "PERMITE_3R_7D: payer told new attempts may happen in the next days" });
    const plan = [...new Set(p.retryPlan)].sort((a, b) => a - b);
    let paid = false;
    let used = 0;
    for (const off of plan) {
      const d = due + off;
      if (used >= 3) break;
      if (off > 7) {
        ev.push({ day: d, h: 9, kind: "fail", text: `D+${off} is beyond the 7-day window → pain.014 RJCT DTNT` });
        break;
      }
      if (d >= nextStart) {
        ev.push({ day: d, h: 9, kind: "fail", text: `D+${off} falls in the next cycle (starts ${iso(nextStart)}) → not allowed` });
        break;
      }
      used++;
      const e2e = e2eAuto(RECEIVER_ISPB, compact(d), seq++);
      ev.push({ day: d - 1, h: 20, kind: "api", text: `POST /cobr/{txid}/retentativa/${iso(d)} → pain.013 NTAG (new EndToEndId ${e2e}, same amount) sent before 23:59 of the day before` });
      const t: Tentativa = { date: d, tipo: "NTAG", status: "AGENDADA", e2e };
      c.tentativas.push(t);
      ev.push({ day: d - 1, h: 21, kind: "ok", text: "pain.014 ACSP → tentativa NTAG AGENDADA (the payer cannot cancel an NTAG schedule)" });
      if (attempt(d, t)) {
        paid = true;
        c.paidOn = d;
        break;
      }
    }
    c.status = paid ? "CONCLUIDA" : "EXPIRADA";
    if (paid) ev.push({ day: c.paidOn!, h: 21, kind: "notify", text: `payer notified: paid on retry (${iso(c.paidOn!)})` });
    else ev.push({ day: due + 7, h: 21, kind: "fail", text: `all ${c.tentativas.length} attempts failed → cobrança not paid via Pix Automático` });
  }
  return out;
}
