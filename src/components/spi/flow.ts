/**
 * Timeline model of one Pix settlement cycle between two direct SPI participants
 * (Manual de Fluxos §3.1.1 + Manual de Tempos §1 and §4.1, Regulamento do SPI arts. 34–42,
 * IN BCB 243 arts. 18–19).
 *
 * Times are seconds after t0′ (AccptncDtTm).
 */

export type Lane = 0 | 1 | 2 | 3 | 4; // payer, payer PSP, SPI, receiver PSP, receiver
export type Ev = {
  t: number;
  from: Lane;
  to: Lane;
  label: string;
  sub?: string;
  tone?: "ok" | "bad" | "warn" | "info" | "muted";
  /** marker on the timeline (t0′, t1, …) */
  mark?: string;
};

export type FlowParams = {
  mode: "PAGPRI" | "PAGFRD";
  validation: number; // t1 − t0′
  net: number; // one-way latency PSP ↔ SPI (ICOM over RSFN)
  spi: number; // SPI processing per leg
  receiver: number; // t3′ − t2 (receiver PSP fetch + validate + answer)
  receiverDown: boolean;
};

export const VALIDATION_LIMIT = 34; // IN BCB 243 art. 18
export const SETTLEMENT_LIMIT = 40; // Manual de Tempos §1.1, IN 243 art. 19 (primary channel)

export type FlowResult = {
  events: Ev[];
  outcome: "settled" | "AB11" | "AB03";
  deadline: number;
  end: number;
  marks: { t: number; label: string; tone?: Ev["tone"] }[];
  spiTime?: number;
  receiverTime?: number;
  payerExperience?: number;
  total?: number;
};

export function runFlow(p: FlowParams): FlowResult {
  const ev: Ev[] = [];
  const t0 = 0;
  ev.push({ t: t0, from: 0, to: 1, label: "confirm payment", sub: "AccptncDtTm = t0′", mark: "t0′" });
  ev.push({ t: t0 + 0.05, from: 1, to: 1, label: "check limits, fraud; block amount in payer's account", tone: "muted" });
  const t1 = p.validation;
  ev.push({ t: t1, from: 1, to: 1, label: "build + sign pacs.008", sub: "CreDtTm = t1", mark: "t1", tone: "muted" });
  const t1r = t1 + p.net;
  ev.push({ t: t1r, from: 1, to: 2, label: "POST pacs.008", sub: "ICOM 201 + storage protocol = t1′", mark: "t1′", tone: "info" });
  const deadline = p.mode === "PAGPRI" ? t0 + SETTLEMENT_LIMIT : t1r + SETTLEMENT_LIMIT;

  if (p.mode === "PAGPRI" && p.validation > VALIDATION_LIMIT) {
    const t = t1r + p.spi;
    ev.push({ t: t1r + p.spi / 2, from: 2, to: 2, label: `validation time ${p.validation.toFixed(1)} s > ${VALIDATION_LIMIT} s`, tone: "bad" });
    ev.push({ t, from: 2, to: 1, label: "pacs.002 RJCT AB11", sub: "TimeoutDebtorAgent, raised by the SPI", tone: "bad", mark: "t5a" });
    ev.push({ t: t + p.net + 0.1, from: 1, to: 0, label: "payment failed; unblock funds", tone: "bad" });
    return finish(ev, "AB11", deadline);
  }

  ev.push({ t: t1r + p.spi * 0.4, from: 2, to: 2, label: "schema, signature, ISPBs, Conta PI balance → reserve amount", sub: "acceptance by the SPI (bloqueio prévio)", tone: "muted" });
  const t2 = t1r + p.spi;
  ev.push({ t: t2, from: 2, to: 3, label: "pacs.008 available", sub: "receiver fetches via GET /messages (long poll) = t2", mark: "t2", tone: "info" });

  const t3 = t2 + p.receiver;
  const late = p.receiverDown || t3 + p.spi * 0.3 > deadline;
  if (!p.receiverDown) {
    ev.push({ t: t2 + Math.min(p.receiver, 0.3) * 0.5 + p.net, from: 3, to: 3, label: "validate account, CPF/CNPJ; provisional credit", tone: "muted" });
  }
  if (late) {
    ev.push({ t: deadline, from: 2, to: 2, label: `${SETTLEMENT_LIMIT} s budget exhausted → release reserve`, tone: "bad", mark: "limit" });
    ev.push({ t: deadline + 0.05, from: 2, to: 1, label: "pacs.002 RJCT AB03", sub: "AbortedSettlementTimeout (SPI)", tone: "bad", mark: "t5a" });
    ev.push({ t: deadline + 0.06, from: 2, to: 3, label: "pacs.002 RJCT AB03", sub: "undo the provisional credit", tone: "bad" });
    ev.push({ t: deadline + 0.05 + p.net + 0.1, from: 1, to: 0, label: "payment failed; unblock funds", tone: "bad" });
    if (!p.receiverDown && t3 > deadline) {
      ev.push({ t: t3, from: 3, to: 2, label: "late pacs.002 ACSP", sub: "too late: the order is already rejected", tone: "warn" });
    }
    return finish(ev, "AB03", deadline);
  }

  ev.push({ t: t3, from: 3, to: 2, label: "pacs.002 ACSP", sub: "AcceptedSettlementInProcess = t3′", mark: "t3′", tone: "ok" });
  const t4 = t3 + p.spi * 0.3;
  ev.push({ t: t4, from: 2, to: 2, label: "debit payer Conta PI, credit receiver Conta PI", sub: "finality: irrevocable = t4", mark: "t4", tone: "ok" });
  const t5 = t4 + p.spi * 0.7;
  ev.push({ t: t5, from: 2, to: 3, label: "pacs.002 ACCC", sub: "settlement completed on creditor side", tone: "ok" });
  ev.push({ t: t5, from: 2, to: 1, label: "pacs.002 ACSC", sub: "settlement completed = t5a", mark: "t5a", tone: "ok" });
  ev.push({ t: t5 + p.net + 0.1, from: 3, to: 4, label: "credit made final; notify receiver", tone: "ok" });
  const t6 = t5 + p.net + 0.15;
  ev.push({ t: t6, from: 1, to: 0, label: "debit account; \"Pix sent\"", sub: "t6a", mark: "t6a", tone: "ok" });
  const r = finish(ev, "settled", deadline);
  r.spiTime = t2 - t1r + (t5 - t3);
  r.receiverTime = t3 - t2;
  r.payerExperience = t6 - t0;
  r.total = t4 - (p.mode === "PAGPRI" ? t0 : t1r);
  return r;
}

function finish(ev: Ev[], outcome: FlowResult["outcome"], deadline: number): FlowResult {
  ev.sort((a, b) => a.t - b.t);
  const marks = ev.filter((e) => e.mark).map((e) => ({ t: e.t, label: e.mark!, tone: e.tone }));
  return { events: ev, outcome, deadline, end: ev[ev.length - 1].t, marks };
}
