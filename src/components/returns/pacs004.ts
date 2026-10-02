/**
 * pacs.004 (PmtRtr) as specified by the SPI catalog (pacs.004.spi.1.5, Catálogo v5.13),
 * plus the business rules for devoluções from the Regulamento Pix (arts. 40–41-A),
 * the Manual de Fluxos §4 and the pacs.002 domain table.
 */
import { addMs, appHdr, money2, msgId, PAYEE_PSP, PAYER_PSP, RTR_RE, rtrId, SPI_ISPB, x, type XNode } from "@/components/spi/xml";

export type ReturnReason = "MD06" | "BE08" | "FR01" | "SL02";

export const RETURN_REASONS: { code: ReturnReason; iso: string; who: string; text: string }[] = [
  { code: "MD06", iso: "RefundRequestByEndCustomer", who: "the receiver (user) asks", text: "The ordinary devolução: the user who received the Pix decides to give money back, all or part." },
  { code: "BE08", iso: "BankError", who: "a PSP's operational failure", text: "MED: returned because of an operational failure, either the payer PSP's (it asked for the return) or the receiver PSP's own." },
  { code: "FR01", iso: "Fraud", who: "well-founded suspicion of fraud", text: "MED: returned because of well-founded suspicion of fraud, after an infraction notification or on the receiver PSP's own finding." },
  { code: "SL02", iso: "SpecificServiceOfferedByCreditorAgent", who: "Saque/Troco facilitator", text: "Return of a Pix Saque or of the cash part of a Pix Troco: error in the transaction or disagreement before the cash is handed over." },
];

export type Original = { e2e: string; amount: number; at: string; kind: "IPAY" | "OTHR" | "GSCB"; cash: number };

export const ORIGINAL: Original = {
  e2e: "E11223344202610021403aB3dE5fG7hJ",
  amount: 100,
  at: "2026-10-02T14:03:27.780Z",
  kind: "IPAY",
  cash: 0,
};

export type Pacs004Input = {
  original: Original;
  amount: number;
  reason: ReturnReason;
  prio: "HIGH" | "NORM";
  addtl: string;
  ustrd: string;
  days: number;
  alreadyReturned: number;
  seed: number;
  /** the original payer's PSP trying to send the refunded money back: a return of a return */
  byOriginalPayer?: boolean;
};

export type RetRule = { ok: boolean; field: string; text: string; code?: string; who?: string };

export function returnRules(i: Pacs004Input): RetRule[] {
  const rules: RetRule[] = [];
  const cashOnly = i.reason === "SL02";
  const cap = i.original.kind === "IPAY" ? i.original.amount : cashOnly ? i.original.cash : i.original.amount - i.original.cash;
  rules.push({ ok: i.amount > 0, field: "RtrdIntrBkSttlmAmt", text: "A return moves a positive amount." });
  rules.push({
    ok: i.alreadyReturned + i.amount <= cap + 1e-9,
    field: "RtrdIntrBkSttlmAmt",
    text: `Returns so far (${money2(i.alreadyReturned)}) + this one may not exceed ${i.original.kind === "IPAY" ? "the original payment" : cashOnly ? "the cash part" : "the purchase part"} (${money2(cap)}).`,
    code: "AM09",
    who: "original payer's PSP",
  });
  const exempt = cashOnly; // Saque, and Troco's cash part, are exempt from the 90-day limit (Regulamento art. 41-A, II)
  rules.push({
    ok: exempt || i.days <= 90,
    field: "days",
    text: exempt ? "Saque/Troco cash part: not subject to the 90-day limit (art. 41-A, II); the facilitator must start it within 1 h of finding it due." : "Must be started within 90 days of the original transaction.",
    code: "DT05",
    who: "SPI",
  });
  rules.push({
    ok: !cashOnly || i.original.kind !== "IPAY",
    field: "Cd",
    text: "SL02 only for a Pix Saque, or the cash part of a Pix Troco.",
    code: "SL02",
    who: "original payer's PSP",
  });
  rules.push({
    ok: !i.byOriginalPayer,
    field: "OrgnlEndToEndId",
    text: "Only the original receiver's side may return a payment. Sending a refund back again (returning a return) is not allowed; that needs a new pacs.008.",
    code: "AG13",
    who: "SPI",
  });
  rules.push({ ok: i.addtl.length <= 105, field: "AddtlInf", text: "RtrRsnInf/AddtlInf: up to 105 chars." });
  rules.push({ ok: i.ustrd.length <= 140, field: "Ustrd", text: "OrgnlTxRef/RmtInf/Ustrd: up to 140 chars (from the API Pix 'descricao')." });
  return rules;
}

export function buildPacs004(i: Pacs004Input) {
  const at = addMs(i.original.at, Math.round(i.days * 86400_000) + 3_600_000);
  const sender = PAYEE_PSP.ispb; // the original receiver's PSP sends the return
  const MsgId = msgId(sender, i.seed);
  const RtrId = rtrId(sender, at, i.seed + 3);
  const rules = returnRules(i);
  rules.unshift({ ok: RTR_RE.test(RtrId), field: "RtrId", text: "RtrId: D + ISPB + yyyyMMddHHmm + 11 alphanumerics (±12 h tolerance on the timestamp).", code: "FF08", who: "SPI" });
  const bad = (f: string) => rules.some((r) => !r.ok && r.field === f);
  const fl = (f: string): Partial<XNode> | undefined => (bad(f) ? { flag: "error" } : undefined);
  const reason = RETURN_REASONS.find((r) => r.code === i.reason)!;
  const agent = (tag: string, ispb: string, d: string) => x(tag, [x("FinInstnId", [x("ClrSysMmbId", [x("MmbId", ispb, d)])])]);

  const root = x(
    "Envelope",
    [
      appHdr(sender, SPI_ISPB, MsgId, "pacs.004.spi.1.5", at),
      x("Document", [
        x(
          "PmtRtr",
          [
            x("GrpHdr", [
              x("MsgId", MsgId, "idMensagem: M + ISPB of the PSP sending the return (the original receiver's PSP) + 23 chars."),
              x("CreDtTm", at, "Creation time (UTC)."),
              x("NbOfTxs", "1", "Number of TxInf blocks (≥ 1)."),
              x("SttlmInf", [x("SttlmMtd", "CLRG", "Settled through the SPI, like the payment.")]),
            ]),
            x(
              "TxInf",
              [
                x("RtrId", RtrId, "idOperacao: D + ISPB of whoever generated it (direct or indirect participant) + yyyyMMddHHmm UTC + 11 alphanumerics. The return's own id and its idempotency key; one per return, so partial returns each get a new one.", fl("RtrId")),
                x("OrgnlEndToEndId", i.original.e2e, "idFimAFim of the pacs.008 being returned. This is all the receiving side needs to find the payer's account: there is no Dbtr/Cdtr party block in a pacs.004.", fl("OrgnlEndToEndId")),
                x("RtrdIntrBkSttlmAmt", money2(i.amount), "valor of this return. Any amount up to what is still returnable; above it the original payer's PSP answers RJCT AM09.", { attrs: { Ccy: "BRL" }, ...fl("RtrdIntrBkSttlmAmt") }),
                x("SttlmPrty", i.prio, i.prio === "HIGH" ? "HIGH: send now (the user asked for the return immediately)." : "NORM: the user asked to postpone it, or the PSP has a justified anti-fraud reason to delay."),
                x("ChrgBr", "SLEV", "Always SLEV."),
                x(
                  "RtrRsnInf",
                  [
                    x("Rsn", [x("Cd", i.reason, `codigoDevolucao ${reason.code} (${reason.iso}): ${reason.text}`, fl("Cd"))]),
                    i.addtl !== "" && x("AddtlInf", i.addtl, "motivoDevolucao: optional free text, ≤ 105 chars.", fl("AddtlInf")),
                  ],
                  "Exactly one return reason. The domain has only four codes.",
                ),
                x(
                  "OrgnlTxRef",
                  [
                    i.ustrd !== "" && x("RmtInf", [x("Ustrd", i.ustrd, "informacoesEntreUsuarios: text for the original payer (≤ 140). Must be filled whenever the user who is returning wrote something.", fl("Ustrd"))]),
                    agent("DbtrAgt", sender, `participanteDoUsuarioPagador of the RETURN: the PSP debited now, i.e. the original receiver's PSP (${PAYEE_PSP.name}). Roles are swapped relative to the pacs.008.`),
                    agent("CdtrAgt", PAYER_PSP.ispb, `participanteDoUsuarioRecebedor of the RETURN: the PSP credited now, i.e. the original payer's PSP (${PAYER_PSP.name}).`),
                  ],
                  "References to the original transaction, seen from the return's direction.",
                ),
              ],
              "One returned transaction.",
            ),
          ],
          "pacs.004.001.09 payment return.",
        ),
      ]),
    ],
    "pacs.004 envelope, namespace https://www.bcb.gov.br/pi/pacs.004/1.5",
    { attrs: { xmlns: "https://www.bcb.gov.br/pi/pacs.004/1.5" } },
  );
  return { root, rules, rtrId: RtrId, msgId: MsgId, at };
}
