/** State machine of a recorrência (API Pix `rec.status`) and of its confirmation request (`solicrec.status`). */

export type RecStatus = "CRIADA" | "APROVADA" | "REJEITADA" | "EXPIRADA" | "CANCELADA";
export type SolicStatus = "—" | "CRIADA" | "ENVIADA" | "RECEBIDA" | "ACEITA" | "REJEITADA" | "EXPIRADA" | "CANCELADA";

export type LState = {
  rec: RecStatus;
  solic: SolicStatus;
  log: { t: string; msg: string; note: string }[];
  /** scheduled cobranças still pending (for cancellation side-effects) */
  scheduled: number;
  clock: number;
};

export type EventId =
  | "solicrec"
  | "send009"
  | "receipt"
  | "noReceipt"
  | "confirmJ1"
  | "rejectAP13"
  | "rejectAP14"
  | "expire"
  | "confirmQR"
  | "recvCancelPending"
  | "schedule"
  | "payerCancel"
  | "recvCancel"
  | "fraud"
  | "dataFinal";

export const EVENTS: { id: EventId; label: string; who: "receiver" | "payer" | "psp" | "time" }[] = [
  { id: "solicrec", label: "POST /solicrec", who: "receiver" },
  { id: "send009", label: "send pain.009", who: "psp" },
  { id: "receipt", label: "pain.012 receipt (< 1 min)", who: "psp" },
  { id: "noReceipt", label: "no receipt in 1 min", who: "time" },
  { id: "confirmJ1", label: "payer confirms (J1)", who: "payer" },
  { id: "rejectAP13", label: "payer: don't know receiver", who: "payer" },
  { id: "rejectAP14", label: "payer: not interested", who: "payer" },
  { id: "expire", label: "30 days pass", who: "time" },
  { id: "confirmQR", label: "payer confirms via QR (J2/J3/J4)", who: "payer" },
  { id: "recvCancelPending", label: "receiver cancels", who: "receiver" },
  { id: "schedule", label: "schedule a cobrança", who: "receiver" },
  { id: "payerCancel", label: "payer cancels authorization", who: "payer" },
  { id: "recvCancel", label: "receiver cancels recorrência", who: "receiver" },
  { id: "fraud", label: "payer PSP: suspected fraud", who: "psp" },
  { id: "dataFinal", label: "dataFinal reached", who: "time" },
];

export const initL = (): LState => ({
  rec: "CRIADA",
  solic: "—",
  log: [{ t: "T+0", msg: "POST /rec → 201", note: "recorrência created, status CRIADA, ativacao.tipoJornada AGUARDANDO_DEFINICAO" }],
  scheduled: 0,
  clock: 0,
});

const pendingSolic = (s: LState) => s.solic === "CRIADA" || s.solic === "ENVIADA" || s.solic === "RECEBIDA";

export function enabled(s: LState, e: EventId): boolean {
  const open = s.rec === "CRIADA";
  switch (e) {
    case "solicrec":
      return open && (s.solic === "—" || s.solic === "EXPIRADA");
    case "send009":
      return open && s.solic === "CRIADA";
    case "receipt":
    case "noReceipt":
      return open && s.solic === "ENVIADA";
    case "confirmJ1":
    case "rejectAP13":
    case "rejectAP14":
    case "expire":
      return open && s.solic === "RECEBIDA";
    case "confirmQR":
      return open;
    case "recvCancelPending":
      return open;
    case "schedule":
    case "payerCancel":
    case "recvCancel":
    case "fraud":
    case "dataFinal":
      return s.rec === "APROVADA";
  }
}

const stamp = (s: LState, dt: number, unit: string) => {
  s.clock += dt;
  return `T+${s.clock}${unit}`;
};

export function apply(prev: LState, e: EventId): LState {
  const s: LState = { ...prev, log: [...prev.log] };
  const add = (t: string, msg: string, note: string) => s.log.push({ t, msg, note });
  switch (e) {
    case "solicrec":
      s.solic = "CRIADA";
      add(stamp(s, 1, "s"), "POST /solicrec → 201", "idSolicRec SC… assigned; destinatario = payer account; dataExpiracaoSolicitacao ≤ 30 days");
      break;
    case "send009":
      s.solic = "ENVIADA";
      add(stamp(s, 1, "s"), "pain.009 → SPI → payer PSP", "MndtInitnReq with MndtId = idRec, CRAT; 1-minute receipt timer starts");
      break;
    case "receipt":
      s.solic = "RECEBIDA";
      add(stamp(s, 1, "s"), "pain.012 ← payer PSP", "receipt confirmation; request appears under 'Autorizações pendentes'");
      break;
    case "noReceipt":
      s.solic = "CANCELADA";
      s.rec = "CANCELADA";
      add(stamp(s, 60, "s"), "timeout 60 s", "Manual de Tempos §3.1: receiver PSP must set the recorrência to cancelled (pain.011 reason NRES exists for this)");
      break;
    case "confirmJ1":
      s.solic = "ACEITA";
      s.rec = "APROVADA";
      add(stamp(s, 3, "h"), "pain.012 CFDB/AUT1 ← payer PSP", "payer confirmed; codMunIBGE sent; valor máximo kept private");
      add(`${s.log[s.log.length - 1].t}+4s`, "pain.012 → payer PSP (conclusion)", "≤ 1 h; rec.status APROVADA; webhook to the receiver");
      break;
    case "rejectAP13":
    case "rejectAP14":
      s.solic = "REJEITADA";
      s.rec = "REJEITADA";
      add(
        stamp(s, 2, "d"),
        `pain.012 status=false ${e === "rejectAP13" ? "AP13" : "AP14"} ← payer PSP`,
        `${e === "rejectAP13" ? "NotRecognizedByDebtor" : "RejectedByDebtor"}; no codMunIBGE; the receiver PSP does NOT answer this pain.012. Re-sending the same offer within 30 days counts as abusive.`,
      );
      break;
    case "expire":
      s.solic = "EXPIRADA";
      add(stamp(s, 30, "d"), "dataExpiracaoSolicitacao passed", "payer PSP deletes it from the pending list; the recorrência stays CRIADA and may get a new solicitação (adjust dataInicial first)");
      break;
    case "confirmQR": {
      const hadPending = pendingSolic(s);
      s.rec = "APROVADA";
      if (hadPending) s.solic = "CANCELADA";
      add(stamp(s, 1, "d"), "pain.012 CFDB/AUT2-4 ← payer PSP", "confirmation through a QR journey");
      if (hadPending) add(s.log[s.log.length - 1].t, "pain.011 → payer PSP", "receiver PSP must cancel the still-pending Jornada 1 request for the same recorrência");
      break;
    }
    case "recvCancelPending":
      s.rec = "CANCELADA";
      if (pendingSolic(s)) s.solic = "CANCELADA";
      add(stamp(s, 1, "h"), "PATCH /rec/{idRec} status CANCELADA", pendingSolic(prev) ? "pain.011 cancels the pending request too" : "no request was pending");
      break;
    case "schedule":
      s.scheduled += 1;
      add(stamp(s, 5, "d"), "pain.013 AGND → pain.014 ACSP", `cobrança #${s.scheduled} scheduled at the payer PSP`);
      break;
    case "payerCancel":
      s.rec = "CANCELADA";
      add(stamp(s, 1, "d"), "pain.011 SLDB → receiver PSP", "immediate; solicitante USUARIO_PAGADOR; receipt pain.012 within 12 h (else assumed done)");
      if (s.scheduled) add(s.log[s.log.length - 1].t, `camt.055 CCLD ×${s.scheduled}`, "every scheduled debit (incl. retries) is cancelled, except those settling today");
      s.scheduled = 0;
      break;
    case "recvCancel":
      s.rec = "CANCELADA";
      add(stamp(s, 1, "d"), "pain.011 SLCR → payer PSP", "schedules from D+1 are cancelled (from D+2 if the pain.011 arrives after 22h)");
      if (s.scheduled) add(s.log[s.log.length - 1].t, `camt.055 CCLD ×${s.scheduled}`, "payer PSP reports each cancelled schedule");
      s.scheduled = 0;
      break;
    case "fraud":
      s.rec = "CANCELADA";
      add(stamp(s, 1, "d"), "pain.011 FRUD → receiver PSP", "solicitante PSP_PAGADOR; other PSP-initiated reasons: ACCL (account closed), DCSD (death), SJUD (court order)");
      s.scheduled = 0;
      break;
    case "dataFinal":
      s.rec = "EXPIRADA";
      add(stamp(s, 180, "d"), "calendario.dataFinal passed", "the recorrência expires; no new pain.013 is accepted");
      break;
  }
  return s;
}

export const REC_STATES: RecStatus[] = ["CRIADA", "APROVADA", "REJEITADA", "EXPIRADA", "CANCELADA"];
export const SOLIC_STATES: SolicStatus[] = ["CRIADA", "ENVIADA", "RECEBIDA", "ACEITA", "REJEITADA", "EXPIRADA", "CANCELADA"];
