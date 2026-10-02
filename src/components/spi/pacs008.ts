/**
 * pacs.008 (FIToFICstmrCdtTrf) as specified by the SPI catalog (pacs.008.spi.1.16, Catálogo v5.13).
 * Builds the XML tree from form inputs and evaluates the catalog's filling rules.
 */
import { appHdr, E2E_RE, e2eId, money2, msgId, PAYEE_PSP, PAYER_PSP, SPI_ISPB, x, type XNode } from "./xml";

export type Initiation = "MANU" | "DICT" | "QRDN" | "QRES" | "INIC" | "APDN" | "APES" | "AUTO";
export type Purpose = "IPAY" | "GSCB" | "OTHR";
export type Service = "PAGPRI" | "PAGFRD" | "PAGAGD";
export type AcctType = "CACC" | "SVGS" | "TRAN";

export const INITIATIONS: { value: Initiation; label: string; doc: string }[] = [
  { value: "MANU", label: "MANU", doc: "Manual entry of branch/account data (no Pix key)." },
  { value: "DICT", label: "DICT", doc: "Manual entry of a Pix key, resolved through DICT." },
  { value: "QRES", label: "QRES", doc: "Static QR code (BR Code without a payload URL)." },
  { value: "QRDN", label: "QRDN", doc: "Dynamic QR code: the payload JSON fetched from the receiver's URL." },
  { value: "APES", label: "APES", doc: "Pix por aproximação (NFC) carrying static-QR data." },
  { value: "APDN", label: "APDN", doc: "Pix por aproximação (NFC) carrying dynamic-QR data." },
  { value: "INIC", label: "INIC", doc: "Started by a payment initiation service (ITP) that already holds all receiver data." },
  { value: "AUTO", label: "AUTO", doc: "Pix Automático debit, scheduled from a pain.013 instruction." },
];

export const PURPOSES: { value: Purpose; label: string; doc: string }[] = [
  { value: "IPAY", label: "IPAY", doc: "Purchase or transfer: the ordinary Pix." },
  { value: "GSCB", label: "GSCB", doc: "Pix Troco: purchase plus cash back." },
  { value: "OTHR", label: "OTHR", doc: "Pix Saque: cash withdrawal at an agent." },
];

export const SERVICES: { value: Service; prio: "HIGH" | "NORM"; label: string; doc: string }[] = [
  { value: "PAGPRI", prio: "HIGH", label: "HIGH · PAGPRI", doc: "Immediate payment. Primary channel, 40 s clock from t0′ (AccptncDtTm)." },
  { value: "PAGFRD", prio: "NORM", label: "NORM · PAGFRD", doc: "Payment held for anti-fraud analysis. Primary channel; the SPI ignores the reported validation time and starts the 40 s clock on receipt." },
  { value: "PAGAGD", prio: "NORM", label: "NORM · PAGAGD", doc: "Scheduled payment (Pix Agendado, cobv, Pix Automático). Secondary channel, 45 min limit." },
];

export type DirEntry = {
  key: string;
  keyType: string;
  name: string;
  doc: string;
  ispb: string;
  branch: string;
  account: string;
  acctType: AcctType;
};

/** A fictional slice of DICT: what a key lookup would return. */
export const DIRECTORY: DirEntry[] = [
  { key: "maria.souza@exemplo.com.br", keyType: "EMAIL", name: "Maria Souza", doc: "12345678909", ispb: PAYEE_PSP.ispb, branch: "0001", account: "48213307", acctType: "TRAN" },
  { key: "+5511987654321", keyType: "PHONE", name: "João Pereira", doc: "98765432100", ispb: PAYEE_PSP.ispb, branch: "0001", account: "10077421", acctType: "CACC" },
  { key: "7d9f0335-8dcc-4054-9bf9-0dbd61d36906", keyType: "EVP", name: "Padaria Pão Quente Ltda", doc: "11222333000181", ispb: PAYEE_PSP.ispb, branch: "0001", account: "90011234", acctType: "CACC" },
];

export type Pacs008Input = {
  amount: number;
  initiation: Initiation;
  purpose: Purpose;
  service: Service;
  payerName: string;
  payerDoc: string;
  payerAcct: string;
  payerBranch: string;
  payerAcctType: AcctType;
  payeeKey: string; // used unless MANU/AUTO
  manual: { ispb: string; branch: string; account: string; doc: string; acctType: AcctType };
  txid: string;
  remittance: string;
  viaItp: boolean;
  purchase: number; // GSCB
  cash: number; // GSCB / OTHR
  creDtTm: string;
  accptncDtTm: string;
  seed: number;
};

export type Rule = { ok: boolean; field: string; text: string; code?: string; who?: "SPI" | "receiver PSP" };

export function buildPacs008(i: Pacs008Input) {
  const rules: Rule[] = [];
  const svc = SERVICES.find((s) => s.value === i.service)!;
  const usesKey = i.initiation !== "MANU" && i.initiation !== "AUTO";
  const dir = DIRECTORY.find((d) => d.key === i.payeeKey);
  const payee = usesKey && dir ? { ispb: dir.ispb, branch: dir.branch, account: dir.account, doc: dir.doc, acctType: dir.acctType } : i.manual;
  const MsgId = msgId(PAYER_PSP.ispb, i.seed);
  const E2E = e2eId(PAYER_PSP.ispb, i.creDtTm, i.seed + 7);

  // ---------- rules (paraphrased from the catalog's "Regra para o Brasil" column) ----------
  rules.push({ ok: i.amount > 0, field: "IntrBkSttlmAmt", text: "Amount must be greater than zero.", code: "AM01", who: "SPI" });
  rules.push({ ok: E2E_RE.test(E2E), field: "EndToEndId", text: "EndToEndId must match E + ISPB + yyyyMMddHHmm + 11 alphanumerics (32 chars).", code: "FF08", who: "SPI" });

  // TxId (idConciliacaoRecebedor)
  const t = i.txid.trim();
  const alnumOk = /^[a-zA-Z0-9]*$/.test(t);
  let txOk = true;
  let txText = "";
  switch (i.initiation) {
    case "MANU":
    case "DICT":
      txOk = t === "";
      txText = "MANU/DICT: TxId must not be filled.";
      break;
    case "QRES":
    case "APES":
      txOk = alnumOk && t.length <= 25;
      txText = "QRES/APES: copy the static QR's txid if it has one (≤ 25 alphanumerics); otherwise omit.";
      break;
    case "QRDN":
    case "APDN":
      txOk = alnumOk && t.length >= 26 && t.length <= 35;
      txText = "QRDN/APDN: mandatory, the txid of the dynamic payload, 26–35 alphanumerics.";
      break;
    case "INIC":
      txOk = alnumOk && t.length >= 1 && t.length <= 25;
      txText = "INIC: mandatory, the txid received from the initiation service, ≤ 25 alphanumerics.";
      break;
    case "AUTO":
      txOk = i.viaItp ? t === "" : alnumOk && t.length >= 26 && t.length <= 35;
      txText = i.viaItp ? "AUTO via an initiator: TxId must not be filled." : "AUTO: the txid of the recurring charge, 26–35 alphanumerics.";
      break;
  }
  rules.push({ ok: txOk, field: "TxId", text: txText, code: "BE15", who: "receiver PSP" });

  rules.push({
    ok: !usesKey || !!dir,
    field: "Prxy",
    text: usesKey ? `${i.initiation}: CdtrAcct/Prxy must carry the Pix key used.` : `${i.initiation}: CdtrAcct/Prxy must be absent.`,
  });
  if (i.initiation === "AUTO") rules.push({ ok: i.purpose === "IPAY", field: "Purp", text: "AUTO payments must use Purp = IPAY.", code: "CH16", who: "SPI" });
  if (i.initiation === "INIC") rules.push({ ok: i.viaItp, field: "InitgPty", text: "INIC means an initiator (ITP) started it: InitgPty/…/Id must carry the ITP's CNPJ.", code: "BE05", who: "SPI" });
  if (i.purpose === "GSCB") {
    const ok = Math.round((i.purchase + i.cash) * 100) === Math.round(i.amount * 100);
    rules.push({ ok, field: "RfrdDocAmt", text: "Pix Troco: two AdjstmntAmtAndRsn blocks (VLCP purchase, VLDN cash) whose sum equals IntrBkSttlmAmt.", code: "AM12", who: "SPI" });
    rules.push({ ok: i.cash > 0, field: "VLDN", text: "Pix Troco needs a cash portion (VLDN > 0).", code: "FF07", who: "SPI" });
  }
  if (i.purpose === "OTHR") {
    const ok = Math.round(i.cash * 100) === Math.round(i.amount * 100);
    rules.push({ ok, field: "RfrdDocAmt", text: "Pix Saque: one VLDN block equal to IntrBkSttlmAmt (the cash handed over).", code: "AM12", who: "SPI" });
  }
  if (i.purpose !== "IPAY" && (i.initiation === "AUTO" || i.initiation === "INIC"))
    rules.push({ ok: false, field: "Purp", text: "Saque/Troco are started by reading the agent's QR code, not via AUTO/INIC.", code: "FF07", who: "SPI" });
  rules.push({ ok: i.remittance.length <= 140, field: "Ustrd", text: "RmtInf/Ustrd: free text up to 140 chars.", code: "CH16", who: "SPI" });
  rules.push({ ok: /^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$/.test(i.payerDoc), field: "Dbtr/Id", text: "Payer CPF (11 digits) or CNPJ (14 chars, alphanumeric CNPJ allowed), no punctuation." });
  rules.push({ ok: /^[0-9A-Z]{1,20}$/.test(i.payerAcct), field: "DbtrAcct", text: "Account number: up to 20 chars, check digit included." });

  const bad = (f: string) => rules.some((r) => !r.ok && r.field === f);
  const flag = (f: string): Partial<XNode> | undefined => (bad(f) ? { flag: "error" } : undefined);

  // ---------- tree ----------
  const prvt = (id: string, d: string, f?: string) => x("Id", [x("PrvtId", [x("Othr", [x("Id", id, d, f ? flag(f) : undefined)])])]);
  const acct = (id: string, issr: string, tp: AcctType, who: string, prxy?: XNode | false) =>
    [
      x("Id", [
        x("Othr", [
          x("Id", id, `contaUsuario${who}: account number (≤ 20 chars, check digit included; letters become 0 unless type OTHR).`, who === "Pagador" ? flag("DbtrAcct") : undefined),
          issr ? x("Issr", issr, `agenciaUsuario${who}: branch, up to 4 digits, no check digit. Omitted for accounts without a branch.`) : null,
        ]),
      ]),
      x("Tp", [x("Cd", tp, "Account type: CACC current, SVGS savings, TRAN payment account, SLRY salary (STN only, never as creditor here), OTHR Conta PI itself.")]),
      prxy,
    ] as (XNode | false | null)[];

  const strd: XNode | false =
    i.purpose !== "IPAY" &&
    x(
      "Strd",
      [
        x("RfrdDocInf", [
          x("Tp", [
            x("CdOrPrtry", [x("Prtry", "AGTEC", "modalidadeAgente: AGTEC = the withdrawal agent is a merchant (AGTOT other legal entity / correspondent, AGFSS the facilitator itself).")]),
            x("Issr", PAYEE_PSP.ispb, "facilitadorDoServicoDeSaque: ISPB of the Saque/Troco facilitator (FSS). Unknown ISPB → MD01 from the SPI."),
          ]),
        ]),
        x(
          "RfrdDocAmt",
          [
            i.purpose === "GSCB" &&
              x("AdjstmntAmtAndRsn", [x("Amt", money2(i.purchase), "valorDoDinheiroOuCompra: the purchase amount.", { attrs: { Ccy: "BRL" } }), x("Rsn", "VLCP", "VLCP = valor da compra (purchase).")]),
            x("AdjstmntAmtAndRsn", [x("Amt", money2(i.cash), "The cash handed to the payer.", { attrs: { Ccy: "BRL" }, ...flag("VLDN") }), x("Rsn", "VLDN", "VLDN = valor do recurso em espécie disponibilizado (cash).")]),
          ],
          "Breakdown of the amount; the sum must equal IntrBkSttlmAmt or the SPI rejects with AM12.",
          flag("RfrdDocAmt"),
        ),
      ],
      "Structured block, only for Saque (OTHR) and Troco (GSCB). Must be absent for IPAY.",
    );

  const doc = x(
    "Document",
    [
      x(
        "FIToFICstmrCdtTrf",
        [
          x(
            "GrpHdr",
            [
              x("MsgId", MsgId, "idMensagem: M + sender ISPB + 23 alphanumerics, case-sensitive, never reused by the sender. Identifies the message, not the payment."),
              x("CreDtTm", i.creDtTm, "dataHoraCriacaoParaEmissao (t1). With AccptncDtTm it gives the validation time the SPI deducts from its 40 s budget."),
              x("NbOfTxs", "1", "quantidadeTransacoes: number of CdtTrfTxInf blocks. Up to 10 for PAGPRI/PAGFRD, up to 500 for PAGAGD; mismatch → AM18."),
              x("SttlmInf", [x("SttlmMtd", "CLRG", "Settlement through a clearing system: always CLRG (the SPI settles gross, one by one, in Conta PI).")]),
              x(
                "PmtTpInf",
                [
                  x("InstrPrty", svc.prio, "prioridadePagamento: HIGH = immediate; NORM = scheduled or held for fraud analysis. Must be HIGH when Purp is REFU or IPRT."),
                  x("SvcLvl", [x("Prtry", i.service, "tipoPrioridadePagamento: HIGH→PAGPRI; NORM→PAGFRD (fraud hold) or PAGAGD (scheduled, secondary channel).")]),
                ],
                "Priority and service level; these pick the channel and the timeout rule.",
              ),
            ],
            "Group header: shared by all transactions in the message.",
          ),
          x(
            "CdtTrfTxInf",
            [
              x(
                "PmtId",
                [
                  x("EndToEndId", E2E, "idFimAFim: E + ISPB of whoever generated it (or the first 8 digits of the ITP's CNPJ) + yyyyMMddHHmm UTC + 11 alphanumerics. The idempotency key of the payment; travels unchanged through pacs.002, pacs.004, camt.054, MED. Its timestamp must be within ±12 h of SPI processing.", flag("EndToEndId")),
                  t !== "" && x("TxId", t, "idConciliacaoRecebedor: the receiver's reconciliation id (the txid of the QR / cob). Rule depends on formaDeIniciacao.", flag("TxId")),
                ],
              ),
              x("IntrBkSttlmAmt", money2(i.amount), "valor: what moves between the two Conta PI. Max 18 digits, 2 decimals, dot separator; Ccy always BRL.", { attrs: { Ccy: "BRL" }, ...flag("IntrBkSttlmAmt") }),
              x("AccptncDtTm", i.accptncDtTm, "t0′: when the payer PSP received the payer's confirmation (for a company: when it accepted the order after checks and blocking). The 40 s clock of a HIGH Pix starts here."),
              x("ChrgBr", "SLEV", "participanteTarifado: always SLEV, charges follow the scheme rules."),
              x(
                "MndtRltdInf",
                [x("Tp", [x("LclInstrm", [x("Prtry", i.initiation, `formaDeIniciacao: how the payment was started. ${INITIATIONS.find((v) => v.value === i.initiation)?.doc} Must be MANU when Purp is REFU/IPRT.`)])])],
                "Odd ISO placement but real: the SPI carries the initiation form inside MandateRelatedInformation.",
              ),
              i.viaItp && x("InitgPty", [x("Id", [x("OrgId", [x("Othr", [x("Id", "34555666000107", "cnpjIniciadorPagamento: CNPJ of the payment initiator (ITP). Mandatory whenever an ITP initiated the Pix, whatever the initiation form.", flag("InitgPty"))])])])]),
              x("Dbtr", [x("Nm", i.payerName, "nomeUsuarioPagador: payer's name (≤ 140). Note: the creditor block has no name, only CPF/CNPJ."), prvt(i.payerDoc, "cpfCnpjUsuarioPagador: 11-digit CPF or 14-char CNPJ, no punctuation.", "Dbtr/Id")]),
              x("DbtrAcct", acct(i.payerAcct, i.payerBranch, i.payerAcctType, "Pagador"), "Payer's transactional account at the payer PSP."),
              x("DbtrAgt", [x("FinInstnId", [x("ClrSysMmbId", [x("MmbId", PAYER_PSP.ispb, "participanteDoUsuarioPagador: ISPB holding the payer's account (direct or indirect participant; the SPI finds the settler). Invalid → RC09.")])])]),
              x("CdtrAgt", [x("FinInstnId", [x("ClrSysMmbId", [x("MmbId", payee.ispb, "participanteDoUsuarioRecebedor: ISPB holding the receiver's account. Invalid → RC10. Same settler as the payer → AG12, it must be settled off-SPI.")])])]),
              x("Cdtr", [prvt(payee.doc, "cpfCnpjUsuarioRecebedor: receiver's CPF/CNPJ. The receiver PSP checks it owns the account: mismatch → BE01 (or CH11).")]),
              x(
                "CdtrAcct",
                acct(
                  payee.account,
                  payee.branch,
                  payee.acctType,
                  "Recebedor",
                  usesKey && x("Prxy", [x("Id", i.payeeKey, "idContaTransacional: the Pix key used. Mandatory for DICT, QRDN, QRES, APDN, APES, INIC; absent for MANU and AUTO.", flag("Prxy"))]),
                ),
                "Receiver's account. The receiver PSP validates it: missing → AC03, closed → AC07, blocked → AC06, wrong type → AC14.",
              ),
              x("Purp", [x("Cd", i.purpose, "finalidadeDaTransacao: IPAY purchase/transfer, GSCB Pix Troco, OTHR Pix Saque, REFU MED refund (Pix Automático), IPRT MED 2.0 return from a non-root account.", flag("Purp"))]),
              (i.remittance || strd) &&
                x("RmtInf", [i.remittance !== "" && x("Ustrd", i.remittance, "informacoesEntreUsuarios: the message the payer typed (≤ 140). In Pix Automático it flows the other way, receiver to payer.", flag("Ustrd")), strd]),
            ],
            "One credit transfer. Everything the receiver PSP needs to credit the account, and nothing more.",
          ),
        ],
        "pacs.008.001.09 FI-to-FI customer credit transfer: the payment order.",
      ),
    ],
    "ISO 20022 business document.",
  );

  const root = x("Envelope", [appHdr(PAYER_PSP.ispb, SPI_ISPB, MsgId, "pacs.008.spi.1.16", i.creDtTm), doc], "SPI envelope: AppHdr + Document, namespace https://www.bcb.gov.br/pi/pacs.008/1.16", {
    attrs: { xmlns: "https://www.bcb.gov.br/pi/pacs.008/1.16" },
  });

  return { root, rules, e2e: E2E, msgId: MsgId, payee };
}
