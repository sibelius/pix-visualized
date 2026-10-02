/** Other SPI messages around a payment: pacs.002, admi.002, camt.060 → camt.054. */
import { REASONS } from "./codes";
import { appHdr, msgId, SPI_ISPB, x, type XNode } from "./xml";

export function pacs002(o: {
  from: string;
  to: string;
  orgnlInstrId: string;
  orgnlE2E: string;
  sts: "ACSP" | "ACSC" | "ACCC" | "RJCT";
  code?: string;
  addtl?: string;
  creDtTm: string;
  settledAt?: string;
  seed: number;
}): XNode {
  const id = msgId(o.from, o.seed);
  const r = o.code ? REASONS.find((c) => c.code === o.code) : undefined;
  const isReturn = o.orgnlInstrId.startsWith("D");
  return x(
    "Envelope",
    [
      appHdr(o.from, o.to, id, "pacs.002.spi.1.17", o.creDtTm),
      x("Document", [
        x(
          "FIToFIPmtStsRpt",
          [
            x("GrpHdr", [
              x("MsgId", id, "idMensagem of this status report: M + ISPB of whoever sends it (the receiver PSP for ACSP/RJCT-by-receiver, 00038166 when the SPI sends)."),
              x("CreDtTm", o.creDtTm, "Creation time of the report (UTC)."),
            ]),
            x(
              "TxInfAndSts",
              [
                x(
                  "OrgnlInstrId",
                  o.orgnlInstrId,
                  isReturn
                    ? "idInstrucaoOriginal: for a return this is the RtrId (D…) of the pacs.004 being answered."
                    : "idInstrucaoOriginal: for a payment, the EndToEndId of the pacs.008 being answered. (For a return it would be the pacs.004's RtrId.)",
                ),
                x("OrgnlEndToEndId", o.orgnlE2E, "idFimAFimOriginal: always the EndToEndId of the original payment, even when answering a return. This is the pacs.002's idempotency key."),
                x(
                  "TxSts",
                  o.sts,
                  {
                    ACSP: "ACSP: receiver PSP accepts; the SPI may now settle.",
                    ACSC: "ACSC: SPI tells the payer's side that settlement completed.",
                    ACCC: "ACCC: SPI tells the receiver's side that the credit is settled.",
                    RJCT: "RJCT: rejected. Terminal; the reason is in StsRsnInf.",
                  }[o.sts],
                  o.sts === "RJCT" ? { flag: "error" } : undefined,
                ),
                o.code &&
                  x("StsRsnInf", [
                    x("Rsn", [x("Cd", o.code, r ? `${r.code} ${r.iso}: ${r.meaning} Raised by: ${r.raisedBy}.` : "Reason code.", { flag: "error" })]),
                    o.addtl && x("AddtlInf", o.addtl, "detalhamentoDoErro: optional free text, up to 105 chars."),
                  ]),
                o.settledAt && x("FctvIntrBkSttlmDt", [x("DtTm", o.settledAt, "dataHoraLiquidacao: when the Conta PI balances changed (t4). Filled only by the SPI, only after settlement.")]),
                o.settledAt && x("OrgnlTxRef", [x("IntrBkSttlmDt", o.settledAt.slice(0, 10), "dataContabil: accounting date (Brasília calendar; next business day if settled on a non-business day). SPI only.")]),
              ],
              "Status of one original transaction.",
            ),
          ],
          "pacs.002.001.10 FI-to-FI payment status report.",
        ),
      ]),
    ],
    "pacs.002 envelope.",
    { attrs: { xmlns: "https://www.bcb.gov.br/pi/pacs.002/1.17" } },
  );
}

export function admi002(o: { to: string; ref: string; reason: string; location: string; desc: string; at: string; seed: number }): XNode {
  const id = msgId(SPI_ISPB, o.seed);
  return x(
    "Envelope",
    [
      appHdr(SPI_ISPB, o.to, id, "admi.002.spi.1.5", o.at),
      x("Document", [
        x(
          "admi.002.001.01",
          [
            x("RltdRef", [x("Ref", o.ref, "Reference of the rejected message: its MsgId, or the ICOM storage protocol when the XML could not even be parsed.")]),
            x(
              "Rsn",
              [
                x("RjctgPtyRsn", o.reason, "MotivoDoErro (≤ 35 chars): short reason from ICOM, or 'Erro no processamento do SPI'.", { flag: "error" }),
                x("RjctnDtTm", o.at, "When it was rejected."),
                x("ErrLctn", o.location, "Where in the message the problem is (≤ 350)."),
                x("RsnDesc", o.desc, "Description (≤ 350)."),
              ],
              "Message-level rejection. Not a pacs.002: no transaction exists yet, so nothing is reserved and the order can be fixed and resent.",
            ),
          ],
          "admi.002 message reject.",
        ),
      ]),
    ],
    "admi.002 envelope.",
    { attrs: { xmlns: "https://www.bcb.gov.br/pi/admi.002/1.5" } },
  );
}

export function camt060(o: { from: string; e2e: string; at: string; seed: number }): XNode {
  const id = msgId(o.from, o.seed);
  return x(
    "Envelope",
    [
      appHdr(o.from, SPI_ISPB, id, "camt.060.spi.1.9", o.at),
      x("Document", [
        x(
          "AcctRptgReq",
          [
            x("GrpHdr", [x("MsgId", id, "idMensagem of the request."), x("CreDtTm", o.at, "Request creation time.")]),
            x("RptgReq", [
              x("Id", o.e2e, "idOriginal: the EndToEndId (payment) or RtrId (return) whose Conta PI entry you want. Only used when asking for camt.054."),
              x("ReqdMsgNmId", "camt.054", "tipoConsulta: camt.054 = details of one entry; camt.053 = balance; camt.052 = list of entries / files."),
              x("AcctOwnr", [x("Agt", [x("FinInstnId", [x("ClrSysMmbId", [x("MmbId", o.from, "The direct participant (Conta PI holder) asking.")])])])]),
            ]),
          ],
          "Account reporting request about the Conta PI.",
        ),
      ]),
    ],
    "camt.060 envelope.",
    { attrs: { xmlns: "https://www.bcb.gov.br/pi/camt.060/1.9" } },
  );
}

export function camt054(o: { to: string; reqMsgId: string; e2e: string; amount: string; dir: "DBIT" | "CRDT"; booked: boolean; code?: string; at: string; seed: number }): XNode {
  const id = msgId(SPI_ISPB, o.seed);
  return x(
    "Envelope",
    [
      appHdr(SPI_ISPB, o.to, id, "camt.054.spi.1.16", o.at),
      x("Document", [
        x(
          "BkToCstmrDbtCdtNtfctn",
          [
            x("GrpHdr", [x("MsgId", id, "SPI's MsgId."), x("CreDtTm", o.at, "Creation time.")]),
            x("Ntfctn", [
              x("Id", o.reqMsgId, "The MsgId of the camt.060 that asked."),
              x("Acct", [x("Id", [x("Othr", [x("Id", o.to, "The Conta PI (identified by the ISPB).")])])]),
              x("Ntry", [
                x("Amt", o.amount, "Entry amount.", { attrs: { Ccy: "BRL" } }),
                x("CdtDbtInd", o.dir, "DBIT for the payer's Conta PI, CRDT for the receiver's."),
                x("Sts", [x("Cd", o.booked ? "BOOK" : "INFO", o.booked ? "BOOK: settled and booked in Conta PI." : "INFO: not settled; the entry exists only for information.", o.booked ? undefined : { flag: "error" })]),
                x("BkTxCd", [x("Domn", [x("Cd", "PMNT", "Payments domain."), x("Fmly", [x("Cd", o.dir === "DBIT" ? "IRCT" : "RRCT", "Family: IRCT issued / RRCT received real-time credit transfer."), x("SubFmlyCd", "DMCT", "Domestic credit transfer.")])])]),
                o.code && x("AddtlNtryInf", o.code, "codigoDeErro: the pacs.002 reason code, present only when the transaction was RJCT.", { flag: "error" }),
                x("AddtlInfInd", [x("MsgNmId", "PACS.008", "Which message originated the entry.")]),
                x("NtryDtls", [x("TxDtls", [x("Refs", [x("EndToEndId", o.e2e, "The payment you asked about.")])])], "…plus the parties and accounts, as in the pacs.008."),
              ]),
            ]),
          ],
          "Debit/credit notification about one Conta PI entry.",
        ),
      ]),
    ],
    "camt.054 envelope.",
    { attrs: { xmlns: "https://www.bcb.gov.br/pi/camt.054/1.16" } },
  );
}
