/** The four authorization journeys of Pix Automático as message sequences between five actors. */

export const ACTORS = ["Payer (pagador)", "Payer PSP", "SPI / ICOM", "Receiver PSP", "Receiver (recebedor)"] as const;
export type Actor = 0 | 1 | 2 | 3 | 4;

export type StepKind = "api" | "iso" | "user" | "local" | "qr" | "pay";

export type Step = {
  from: Actor;
  to: Actor;
  kind: StepKind;
  /** label on the arrow */
  msg: string;
  /** one-paragraph explanation */
  detail: string;
  /** status changes caused by this step */
  status?: { rec?: string; solic?: string; payerSide?: string };
  /** optional timer started/checked by this step */
  timer?: string;
};

export type JourneyKey = "J1" | "J2" | "J3" | "J4";

export const JOURNEYS: Record<JourneyKey, { title: string; blurb: string; mndt: string; steps: Step[] }> = {
  J1: {
    title: "Jornada 1 — no QR Code, push to the payer's app",
    blurb:
      "The payer tells the receiver, outside Pix (phone, website, contract), that they want to pay by Pix Automático. The receiver's PSP pushes a confirmation request (pain.009) into the payer's bank app.",
    mndt: "AUT1",
    steps: [
      {
        from: 4,
        to: 3,
        kind: "api",
        msg: "POST /rec",
        detail:
          "The receiver creates the recorrência: vinculo (contrato, devedor, objeto), calendario (dataInicial, periodicidade, dataFinal?), valor (valorRec or valorMinimoRecebedor) and politicaRetentativa. The PSP assigns the 29-char idRec (RR… or RN…).",
        status: { rec: "CRIADA" },
      },
      {
        from: 4,
        to: 3,
        kind: "api",
        msg: "POST /solicrec",
        detail:
          "The receiver asks its PSP to send a confirmation request to a specific account: destinatario {cpf/cnpj, ispbParticipante, agencia, conta} and calendario.dataExpiracaoSolicitacao (at most 30 days). Only one pending solicitação per recorrência is allowed.",
        status: { solic: "CRIADA" },
      },
      {
        from: 3,
        to: 1,
        kind: "iso",
        msg: "pain.009 (CRAT)",
        detail:
          "Receiver PSP → SPI → payer PSP: MandateInitiationRequest carrying the recorrência (MndtId = idRec, Ocrncs/Frqcy/Tp = MNTH, SeqTp = RCUR, creditor, debtor, amount or floor) and the request id idSolicRec (SC…).",
        status: { solic: "ENVIADA" },
        timer: "≤ 1 min for the receipt pain.012",
      },
      {
        from: 1,
        to: 3,
        kind: "iso",
        msg: "pain.012 (receipt)",
        detail:
          "The payer PSP acknowledges it received the request. If the receiver PSP gets no answer within 1 minute (Manual de Tempos §3.1) it must cancel the recorrência; it should retry the pain.009 inside that minute.",
        status: { solic: "RECEBIDA" },
      },
      {
        from: 1,
        to: 0,
        kind: "user",
        msg: "push: pending authorization",
        detail:
          "The request shows up in the app under 'Autorizações pendentes' (and as a notification shortcut). It stays there until confirmed, rejected, expired (≤ 30 days) or cancelled by the receiver via pain.011.",
      },
      {
        from: 0,
        to: 1,
        kind: "user",
        msg: "confirm + valor máximo",
        detail:
          "The payer authenticates (password/biometrics), reviews receiver, object, periodicity, first date and amount, optionally sets a valor máximo (≥ the receiver's floor) and whether overdraft may be used. One tap = confirms the recorrência + grants permission + authorizes the payer PSP.",
        status: { payerSide: "CFDB (confirmada)" },
      },
      {
        from: 1,
        to: 3,
        kind: "iso",
        msg: "pain.012 (UPDT, CFDB, AUT1)",
        detail:
          "MandateAcceptanceReport with MndtSts = CFDB, MndtPrcgTp = UPDT, the journey code AUT1 and the payer's codMunIBGE (municipality of the account, '0000000' if unknown), used later for local-holiday adjustment. The valor máximo is NOT sent: it stays at the payer PSP.",
        timer: "≤ 1 h for the closing pain.012",
      },
      {
        from: 3,
        to: 1,
        kind: "iso",
        msg: "pain.012 (conclusion)",
        detail:
          "The receiver PSP closes the flow. If it does not answer within 1 hour (Manual de Tempos §3.2), the payer PSP tells the payer the authorization did not complete. Measured SLA: t3'−t2 ≤ 4.6 s at p95.",
        status: { rec: "APROVADA", solic: "ACEITA" },
      },
      {
        from: 3,
        to: 4,
        kind: "api",
        msg: "webhook rec",
        detail: "PUT /webhookrec subscribers get the recorrência with status APROVADA and ativacao.tipoJornada = JORNADA_1. The receiver may now send cobranças (POST /cobr).",
      },
    ],
  },
  J2: {
    title: "Jornada 2 — QR Code with only the recorrência",
    blurb:
      "The receiver shows a QR Code (printed on a counter, on a bill, on screen) whose 80–99 template points to a recorrência location. No payment happens now.",
    mndt: "AUT2",
    steps: [
      {
        from: 4,
        to: 3,
        kind: "api",
        msg: "POST /locrec + POST /rec",
        detail:
          "The receiver creates a location for recorrências and a recorrência bound to it (field loc). The same printed QR can be reused for many customers by re-binding a new recorrência to the location before each scan (the gym-counter example of the Guia).",
        status: { rec: "CRIADA" },
      },
      {
        from: 4,
        to: 0,
        kind: "qr",
        msg: "QR Code composto",
        detail:
          "BR Code with the mandatory 26–51 template (here just a marker, no charge attached) plus an 80–99 template carrying the recorrência URL. Scanning works from the Pix Automático menu, the normal 'Pagar com QR Code' reader or Pix Copia e Cola.",
      },
      {
        from: 1,
        to: 3,
        kind: "api",
        msg: "GET /rec/{recUrlAccessToken}",
        detail:
          "Public endpoint, analogous to the cob payload: returns the RecPayload as a JWS signed by the receiver PSP (same JWS and certificate checks as dynamic QR Codes).",
      },
      {
        from: 0,
        to: 1,
        kind: "user",
        msg: "confirm + valor máximo",
        detail:
          "Same confirmation screen as Jornada 1. If the payer walks away nothing is sent: in QR journeys there is no message from payer PSP to receiver PSP unless the payer confirms.",
        status: { payerSide: "CFDB (confirmada)" },
      },
      {
        from: 1,
        to: 3,
        kind: "iso",
        msg: "pain.012 (UPDT, CFDB, AUT2)",
        detail: "The payer PSP sends the confirmation spontaneously (there was no pain.009). It carries codMunIBGE and the journey code AUT2.",
        timer: "≤ 1 h for the closing pain.012",
      },
      {
        from: 3,
        to: 1,
        kind: "iso",
        msg: "pain.012 (conclusion)",
        detail: "Receiver PSP closes the authorization. If a Jornada 1 request was still pending for the same recorrência, it must now cancel it with a pain.011.",
        status: { rec: "APROVADA" },
      },
      { from: 3, to: 4, kind: "api", msg: "webhook rec", detail: "status APROVADA, tipoJornada JORNADA_2." },
    ],
  },
  J3: {
    title: "Jornada 3 — pay the first charge now and authorize the rest",
    blurb:
      "One QR Code, two payloads: an immediate charge (cob) and the recorrência. Paying implies authorizing; the payer cannot split the two. Used when service starts only after a first payment (e.g., a streaming signup).",
    mndt: "AUT3",
    steps: [
      {
        from: 4,
        to: 3,
        kind: "api",
        msg: "PUT /cob/{txid} + POST /rec",
        detail:
          "The receiver creates an immediate charge and a recorrência whose ativacao.dadosJornada.txid points to that charge (mandatory for Jornada 3). txid can still be edited while the recorrência is CRIADA.",
        status: { rec: "CRIADA" },
      },
      {
        from: 4,
        to: 0,
        kind: "qr",
        msg: "QR Code composto (cob + rec)",
        detail: "26–51 carries the dynamic-charge URL (a normal QR dinâmico imediato); 80–99 carries the recorrência URL.",
      },
      {
        from: 1,
        to: 3,
        kind: "api",
        msg: "GET cob JWS + GET rec JWS",
        detail:
          "The payer PSP must fetch BOTH payloads successfully. If either one fails or is invalid the whole journey is interrupted and the payer is told why.",
      },
      {
        from: 0,
        to: 1,
        kind: "user",
        msg: "pay + ☑ authorize future charges",
        detail:
          "A single confirmation screen with a checkbox stating the payer knows future charges will be paid by Pix Automático. Anti-fraud timers and cautionary blocks apply to the first payment as usual.",
      },
      {
        from: 1,
        to: 3,
        kind: "pay",
        msg: "pacs.008 (QRDN) → pacs.002 ACSC",
        detail:
          "The first payment is a NORMAL Pix on the primary channel (LclInstrm QRDN, TxId = the cob txid) and is shown on the statement as a normal Pix, not as Pix Automático. Both PSPs must wait for its settlement before any authorization message.",
      },
      {
        from: 1,
        to: 3,
        kind: "iso",
        msg: "pain.012 (UPDT, CFDB, AUT3)",
        detail:
          "Only after the pacs.002 settles does the payer PSP send the confirmation. For the SLA, t0' here is the moment the pacs.002 was received, so settlement time is not counted twice.",
        status: { payerSide: "CFDB (confirmada)" },
        timer: "≤ 1 h for the closing pain.012",
      },
      { from: 3, to: 1, kind: "iso", msg: "pain.012 (conclusion)", detail: "Receiver PSP closes the flow.", status: { rec: "APROVADA" } },
      { from: 3, to: 4, kind: "api", msg: "webhook rec + webhook pix", detail: "status APROVADA, tipoJornada JORNADA_3, dadosJornada.txid kept; the cob is CONCLUIDA." },
    ],
  },
  J4: {
    title: "Jornada 4 — pay (or schedule) a bill, then get the offer",
    blurb:
      "The QR on a bill pays that bill as usual; only AFTER payment or scheduling succeeds is the payer offered Pix Automático for future bills. Declining is fine — the bill is still paid.",
    mndt: "AUT4",
    steps: [
      {
        from: 4,
        to: 3,
        kind: "api",
        msg: "PUT /cobv/{txid} + POST /rec",
        detail:
          "A charge with due date (cobv), or static charge data written straight into the QR (useful offline, e.g. a utility meter reader printing bills), plus a recorrência location. The recorrência data always come from a location.",
        status: { rec: "CRIADA" },
      },
      { from: 4, to: 0, kind: "qr", msg: "QR Code composto (cobv + rec)", detail: "26–51: cobv location (or static fields); 80–99: recorrência location." },
      {
        from: 1,
        to: 3,
        kind: "api",
        msg: "GET cobv JWS + GET rec JWS",
        detail:
          "If the recorrência fetch fails, the normal bill payment continues without the offer. If the charge fetch fails or the charge is no longer valid, the journey stops.",
      },
      {
        from: 0,
        to: 1,
        kind: "user",
        msg: "pay or schedule the bill",
        detail: "The payer pays now (primary channel) or schedules it (PAGAGD, secondary channel). Unlike Jornada 3 there is no need to wait for settlement before offering.",
      },
      {
        from: 1,
        to: 0,
        kind: "user",
        msg: "offer: use Pix Automático?",
        detail: "Shown only after a successful payment/scheduling — never after an error.",
      },
      { from: 0, to: 1, kind: "user", msg: "accept + valor máximo", detail: "Same confirmation and parameters as the other journeys.", status: { payerSide: "CFDB (confirmada)" } },
      { from: 1, to: 3, kind: "iso", msg: "pain.012 (UPDT, CFDB, AUT4)", detail: "Confirmation with journey code AUT4 and codMunIBGE.", timer: "≤ 1 h for the closing pain.012" },
      { from: 3, to: 1, kind: "iso", msg: "pain.012 (conclusion)", detail: "Receiver PSP closes the flow.", status: { rec: "APROVADA" } },
      { from: 3, to: 4, kind: "api", msg: "webhook rec", detail: "status APROVADA, tipoJornada JORNADA_4." },
    ],
  },
};
