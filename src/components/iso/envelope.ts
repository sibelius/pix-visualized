/**
 * Annotated XML trees of real SPI envelopes. Field names, multiplicities, types and formats follow the
 * XSDs and XLSX filling rules in spi.5.13.1.zip (Catálogo de Serviços do SFN, Vol. VI, v5.13).
 * Values are fictional (ISPBs 12345678 / 87654321, CPF/CNPJ made up).
 */

export type Info = {
  /** ISO 20022 business name */
  iso: string;
  /** the SPI catalog's Portuguese field name ("Nome no Brasil"), if any */
  br?: string;
  /** multiplicity in the SPI XSD */
  mult: string;
  /** XSD type (SPI restriction) */
  type?: string;
  /** size / format as the catalog states it */
  fmt?: string;
  /** what it means */
  what: string;
};

export type XNode = {
  tag: string;
  info: Info;
  attrs?: Record<string, string>;
  text?: string;
  children?: XNode[];
  /** collapsed by default in the explorer */
  fold?: boolean;
};

const el = (tag: string, info: Info, body?: string | XNode[], extra?: Partial<XNode>): XNode => ({
  tag,
  info,
  ...(typeof body === "string" ? { text: body } : body ? { children: body } : {}),
  ...extra,
});

const wrap = (tag: string, iso: string, what: string, children: XNode[], mult = "[1..1]", extra?: Partial<XNode>) =>
  el(tag, { iso, mult, what }, children, extra);

/** Fr/To blocks: Party9Choice → FIId → FinInstnId → Othr → Id (ISPB) */
function party(tag: "Fr" | "To", ispb: string): XNode {
  const isFr = tag === "Fr";
  return wrap(
    tag,
    isFr ? "From" : "To",
    isFr
      ? "Who sent this message to the SPI (or the SPI itself, when it sends)."
      : "Who the message is for. When a PSP sends, this is always the SPI.",
    [
      wrap("FIId", "FinancialInstitutionIdentification", "Party9Choice: the party is a financial institution (the only branch the SPI allows).", [
        wrap("FinInstnId", "FinancialInstitutionIdentification", "Identification of the institution.", [
          wrap("Othr", "Other", "Generic identification: in Brazil, the ISPB.", [
            el(
              "Id",
              {
                iso: "Identification",
                br: isFr ? "ispbRemetente" : "ispbDestinatario",
                mult: "[1..1]",
                type: "ISPBType",
                fmt: "8 chars [0-9A-Z]{8}",
                what: isFr
                  ? "ISPB of the direct participant that sent the message. 00038166 when the SPI is the sender."
                  : "ISPB of the recipient. A PSP sending to the SPI must put 00038166 here; when the SPI sends, it is the direct participant it delivers to.",
              },
              ispb,
            ),
          ]),
        ]),
      ]),
    ],
  );
}

export const SIGNATURE: XNode = el(
  "ds:Signature",
  {
    iso: "XML Signature (W3C XMLDSig)",
    mult: "[1..1]",
    what: "Enveloped XMLDSig. Three <Reference>s in the SPI: KeyInfo, the AppHdr (URI=\"\"), and the Document (no URI). RSA-SHA256 over exclusive-c14n SignedInfo.",
  },
  [
    wrap("ds:SignedInfo", "SignedInfo", "The part that is actually signed: algorithms plus one digest per reference.", [
      el("ds:CanonicalizationMethod", { iso: "CanonicalizationMethod", mult: "[1..1]", what: "Exclusive XML canonicalization (xml-exc-c14n#) before hashing SignedInfo." }, undefined, {
        attrs: { Algorithm: "http://www.w3.org/2001/10/xml-exc-c14n#" },
      }),
      el("ds:SignatureMethod", { iso: "SignatureMethod", mult: "[1..1]", what: "RSA with SHA-256 (xmldsig-more#rsa-sha256), key from the ICP-Brasil SPB certificate." }, undefined, {
        attrs: { Algorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" },
      }),
      el("ds:Reference", { iso: "Reference (KeyInfo)", mult: "[1..1]", what: "Digest of the <KeyInfo> element, so the certificate identity is bound into the signature." }, [
        el("ds:DigestValue", { iso: "DigestValue", mult: "[1..1]", fmt: "base64(SHA-256)", what: "SHA-256 of the canonicalized KeyInfo." }, "J9fL+Qyrtblr…EbdbrM="),
      ], { attrs: { URI: "#key-info-id" } }),
      el("ds:Reference", { iso: "Reference (AppHdr)", mult: "[1..1]", what: "URI=\"\" with the enveloped-signature transform: in the SPI this covers the AppHdr minus the signature itself." }, [
        el("ds:DigestValue", { iso: "DigestValue", mult: "[1..1]", fmt: "base64(SHA-256)", what: "SHA-256 of the canonicalized AppHdr." }, "D8tkpivJTLnU…hnIwV+4="),
      ], { attrs: { URI: "" } }),
      el("ds:Reference", { iso: "Reference (Document)", mult: "[1..1]", what: "No URI attribute: the SPI defines it as pointing to the <Document> element." }, [
        el("ds:DigestValue", { iso: "DigestValue", mult: "[1..1]", fmt: "base64(SHA-256)", what: "SHA-256 of the canonicalized Document." }, "B/xG0ETsGoVL…fL1gMbI="),
      ]),
    ]),
    el("ds:SignatureValue", { iso: "SignatureValue", mult: "[1..1]", fmt: "base64, 256 bytes for RSA-2048", what: "RSA signature over the canonicalized SignedInfo. See the XMLDSig chapter." }, "QfbSxaFsYZ89…5EAaMg=="),
    el("ds:KeyInfo", { iso: "KeyInfo", mult: "[1..1]", what: "Which certificate signed: issuer DN + serial number (no certificate bytes are embedded)." }, [
      wrap("ds:X509Data", "X509Data", "Certificate reference.", [
        wrap("ds:X509IssuerSerial", "X509IssuerSerial", "Issuer + serial uniquely identify an ICP-Brasil certificate.", [
          el("ds:X509IssuerName", { iso: "X509IssuerName", mult: "[1..1]", what: "Distinguished name of the issuing ICP-Brasil CA." }, "CN=AC Exemplo, OU=CSPB-0, O=ICP-Brasil, C=BR"),
          el("ds:X509SerialNumber", { iso: "X509SerialNumber", mult: "[1..1]", what: "Serial number of the signing certificate (decimal)." }, "20200130224837516000"),
        ]),
      ]),
    ], { attrs: { Id: "key-info-id" } }),
  ],
  { fold: true },
);

function appHdr(fr: string, msgId: string, def: string, creDt: string): XNode {
  return wrap(
    "AppHdr",
    "Business Application Header (head.001.001.01)",
    "The BAH: who sent it, to whom, which message definition, when, and the signature. Same structure in every SPI message.",
    [
      party("Fr", fr),
      party("To", "00038166"),
      el(
        "BizMsgIdr",
        { iso: "BusinessMessageIdentifier", br: "(same as MsgId)", mult: "[1..1]", type: "MsgIdType", fmt: "32 chars M[0-9A-Z]{8}[a-zA-Z0-9]{23}", what: "Must carry the same value as Document/…/GrpHdr/MsgId." },
        msgId,
      ),
      el(
        "MsgDefIdr",
        { iso: "MessageDefinitionIdentifier", br: "idMensagem", mult: "[1..1]", type: "Max35Text", fmt: "max 35 chars", what: "Which SPI message definition (and version) the Document follows: group.number.spi.major.minor." },
        def,
      ),
      el(
        "CreDt",
        { iso: "CreationDate", br: "dataHoraCriacaoParaEmissao", mult: "[1..1]", type: "ISONormalisedDateTime", fmt: "YYYY-MM-DDThh:mm:ss.sssZ (UTC)", what: "When the header was created. May equal GrpHdr/CreDtTm." },
        creDt,
      ),
      wrap("Sgntr", "Signature", "Holds the XMLDSig <ds:Signature> of the sending institution. Click to expand.", [SIGNATURE]),
    ],
  );
}

const ISO_DT = "ISONormalisedDateTime";
const DT_FMT = "YYYY-MM-DDThh:mm:ss.sssZ (UTC)";

export const E2E = "E12345678202610021403k7Qm2Xr9TbA";
const MSGID_008 = "M12345678Q1w2E3r4T5y6U7i8O9p0As1";
const MSGID_002 = "M87654321Zx9Cv8Bn7Mm6Lk5Jh4Gf3Ds";

const agent = (tag: "DbtrAgt" | "CdtrAgt", ispb: string): XNode =>
  wrap(tag, tag === "DbtrAgt" ? "DebtorAgent" : "CreditorAgent", tag === "DbtrAgt" ? "The payer's PSP." : "The payee's PSP.", [
    wrap("FinInstnId", "FinancialInstitutionIdentification", "Institution identification.", [
      wrap("ClrSysMmbId", "ClearingSystemMemberIdentification", "Member of the clearing system (SPI).", [
        el(
          "MmbId",
          {
            iso: "MemberIdentification",
            br: tag === "DbtrAgt" ? "participanteDoUsuarioPagador" : "participanteDoUsuarioRecebedor",
            mult: "[1..1]",
            type: "ISPBType",
            fmt: "8 chars [0-9A-Z]{8}",
            what:
              "ISPB of the PSP holding the user's transactional account. May be an indirect participant: the SPI then finds its settlement provider (liquidante) and moves that direct participant's Conta PI.",
          },
          ispb,
        ),
      ]),
    ]),
  ]);

const userId = (br: string, v: string): XNode =>
  wrap("Id", "Identification", "Party identification.", [
    wrap("PrvtId", "PrivateIdentification", "Used for both people and companies in the SPI.", [
      wrap("Othr", "Other", "Generic id.", [
        el("Id", { iso: "Identification", br, mult: "[1..1]", type: "PICpfCnpj", fmt: "CPF [0-9]{11} or CNPJ [0-9A-Z]{12}[0-9]{2}", what: "CPF (11 digits) or CNPJ (14 chars; the alphanumeric CNPJ is already allowed by the pattern)." }, v),
      ]),
    ]),
  ]);

const account = (who: "Dbtr" | "Cdtr", id: string, issr: string, tp: string, prxy?: string): XNode =>
  wrap(`${who}Acct`, who === "Dbtr" ? "DebtorAccount" : "CreditorAccount", `The ${who === "Dbtr" ? "payer's" : "payee's"} transactional account at its PSP.`, [
    wrap("Id", "Identification", "AccountIdentification4Choice → Other.", [
      wrap("Othr", "Other", "Generic account id.", [
        el("Id", { iso: "Identification", br: who === "Dbtr" ? "contaUsuarioPagador" : "contaUsuarioRecebedor", mult: "[1..1]", type: "ContaUsuarioType", fmt: "max 20 chars [0-9A-Z]", what: "Account number, no check-digit separator." }, id),
        el("Issr", { iso: "Issuer", br: who === "Dbtr" ? "agenciaUsuarioPagador" : "agenciaUsuarioRecebedor", mult: "[0..1]", type: "Max4Numeric", fmt: "max 4 digits", what: "Branch (agência), only if the account has one." }, issr),
      ]),
    ]),
    wrap("Tp", "Type", "Account type.", [
      el("Cd", { iso: "Code", br: who === "Dbtr" ? "tipoContaUsuarioPagador" : "tipoContaUsuarioRecebedor", mult: "[1..1]", type: "ExternalCashAccountType1Code", fmt: "CACC | SVGS | SLRY | TRAN | OTHR", what: "CACC current (conta corrente), SVGS savings (poupança), SLRY salary, TRAN payment account (conta de pagamento)." }, tp),
    ]),
    ...(prxy
      ? [
          wrap("Prxy", "Proxy", "The Pix key used to find the account. Required for DICT, QRDN, QRES, APDN, APES, INIC; absent for MANU and AUTO.", [
            el("Id", { iso: "Identification", br: "idContaTransacional", mult: "[1..1]", type: "Max77Text", fmt: "max 77 chars", what: "The Pix key (CPF, CNPJ, phone +55…, e-mail, or random EVP UUID)." }, prxy),
          ], "[0..1]"),
        ]
      : []),
  ]);

export const PACS008: XNode = el(
  "Envelope",
  { iso: "SPI envelope", mult: "[1..1]", what: "Not an ISO element: the SPI wrapper that joins the BAH (AppHdr) and the Document. Its namespace names the message and its SPI version." },
  [
    appHdr("12345678", MSGID_008, "pacs.008.spi.1.16", "2026-10-02T14:03:27.512Z"),
    wrap("Document", "Document (pacs.008.001.09)", "The ISO 20022 message itself: FIToFICustomerCreditTransferV09, restricted by the SPI.", [
      wrap("FIToFICstmrCdtTrf", "FIToFICustomerCreditTransferV09", "FI-to-FI customer credit transfer: one or more payment orders.", [
        wrap("GrpHdr", "GroupHeader93", "Message-level data shared by all transactions inside.", [
          el("MsgId", { iso: "MessageIdentification", br: "idMensagem", mult: "[1..1]", type: "MsgIdType", fmt: "32 chars: M + ISPB + 23 alnum", what: "Point-to-point id of this message. Unique per sender, never reused. Identifies the message, not the payment." }, MSGID_008),
          el("CreDtTm", { iso: "CreationDateTime", br: "dataHoraCriacaoParaEmissao", mult: "[1..1]", type: ISO_DT, fmt: DT_FMT, what: "When the sender created the message (t1 in the Manual de Tempos), measured before signing." }, "2026-10-02T14:03:27.512Z"),
          el("NbOfTxs", { iso: "NumberOfTransactions", br: "quantidadeTransacoes", mult: "[1..1]", type: "Max15Numeric", fmt: "[0-9]{1,15}, ≥ 1", what: "How many CdtTrfTxInf blocks follow. One message can carry many payments." }, "1"),
          wrap("SttlmInf", "SettlementInstruction7", "How it settles.", [
            el("SttlmMtd", { iso: "SettlementMethod", br: "metodoLiquidacao", mult: "[1..1]", type: "SettlementMethod1Code", fmt: "CLRG", what: "CLRG: settled through a clearing system (the SPI). The only value allowed." }, "CLRG"),
          ]),
          wrap("PmtTpInf", "PaymentTypeInformation28", "Priority and service level.", [
            el("InstrPrty", { iso: "InstructionPriority", br: "prioridadePagamento", mult: "[1..1]", type: "Priority2Code", fmt: "HIGH | NORM", what: "HIGH = settle now (primary channel). NORM = not urgent (scheduled, fraud analysis)." }, "HIGH"),
            wrap("SvcLvl", "ServiceLevel", "Service level (proprietary).", [
              el("Prtry", { iso: "Proprietary", br: "tipoPrioridadePagamento", mult: "[1..1]", type: "PrtrySvcLvlCode", fmt: "PAGPRI | PAGFRD | PAGAGD", what: "PAGPRI priority, PAGFRD under fraud analysis, PAGAGD scheduled (goes on the secondary channel, CSM)." }, "PAGPRI"),
            ]),
          ]),
        ]),
        wrap("CdtTrfTxInf", "CreditTransferTransaction43", "One payment order [1..unbounded]. Idempotency is per transaction (per EndToEndId), not per message.", [
          wrap("PmtId", "PaymentIdentification13", "The transaction's identifiers.", [
            el("EndToEndId", { iso: "EndToEndIdentification", br: "idFimAFim", mult: "[1..1]", type: "EndToEndIdType", fmt: "32 chars: E + ISPB + yyyyMMddHHmm + 11 alnum", what: "The payment's identity for its whole life: echoed in pacs.002, referenced by pacs.004, camt.054, MED. The idempotency key of pacs.008." }, E2E),
            el("TxId", { iso: "TransactionIdentification", br: "idConciliacaoRecebedor", mult: "[0..1]", type: "TxIdType", fmt: "[a-zA-Z0-9]{1,35}", what: "The receiver's reconciliation id: the txid of the dynamic QR / cob, or the static QR's txid (≤ 25 chars there)." }, "fc9a4366ff3d4964b5dbc6c91a8722d3"),
          ]),
          el("IntrBkSttlmAmt", { iso: "InterbankSettlementAmount", br: "valor", mult: "[1..1]", type: "ActiveCurrencyAndAmount", fmt: "decimal, totalDigits 18, fractionDigits 2, ≥ 0; @Ccy = BRL", what: "The amount moved between the two Conta PI. Decimal separator is a dot." }, "150.00", { attrs: { Ccy: "BRL" } }),
          el("AccptncDtTm", { iso: "AcceptanceDateTime", br: "dataHoraRecebimentoPeloParticipanteDoUsuarioPagador", mult: "[1..1]", type: ISO_DT, fmt: DT_FMT, what: "When the payer's PSP received the user's confirmed order (t0'). The 40 s clock starts here." }, "2026-10-02T14:03:26.871Z"),
          el("ChrgBr", { iso: "ChargeBearer", br: "participanteTarifado", mult: "[1..1]", type: "ChargeBearerType1Code", fmt: "SLEV", what: "Charges follow the scheme rules. Only value allowed." }, "SLEV"),
          wrap("MndtRltdInf", "MandateRelatedInformation", "In the SPI, a carrier for the initiation method.", [
            wrap("Tp", "Type", "Mandate type.", [
              wrap("LclInstrm", "LocalInstrument", "Local instrument.", [
                el("Prtry", { iso: "Proprietary", br: "formaDeIniciacao", mult: "[1..1]", type: "PrtryLclInstrmCode", fmt: "MANU DICT QRDN QRES INIC APDN APES AUTO", what: "How the payment was initiated: manual data, Pix key, dynamic/static QR, initiator (ITP), NFC (APDN/APES), Pix Automático." }, "QRDN"),
              ]),
            ]),
          ]),
          wrap("Dbtr", "Debtor", "The payer.", [
            el("Nm", { iso: "Name", br: "nomeUsuarioPagador", mult: "[1..1]", type: "Max140Text", fmt: "max 140 chars", what: "Payer's name as registered. Optional in ISO, mandatory in the SPI." }, "Maria Ficticia Souza"),
            userId("cpfCnpjUsuarioPagador", "12345678909"),
          ]),
          account("Dbtr", "0012345", "0001", "CACC"),
          agent("DbtrAgt", "12345678"),
          agent("CdtrAgt", "87654321"),
          wrap("Cdtr", "Creditor", "The payee. Note: no <Nm> — the SPI does not carry the payee's name.", [userId("cpfCnpjUsuarioRecebedor", "11222333000181")]),
          account("Cdtr", "99887766", "0001", "TRAN", "7d9f0335-8dcc-4054-9bf9-0dbd61d36906"),
          wrap("Purp", "Purpose", "Why the money moves.", [
            el("Cd", { iso: "Code", br: "finalidadeDaTransacao", mult: "[1..1]", type: "ExternalPurpose1Code", fmt: "IPAY GSCB OTHR REFU IPRT", what: "IPAY purchase/transfer, GSCB Pix Troco, OTHR Pix Saque, REFU MED refund (Pix Automático), IPRT MED 2.0 return." }, "IPAY"),
          ]),
          wrap("RmtInf", "RemittanceInformation16", "Information for the payee.", [
            el("Ustrd", { iso: "Unstructured", br: "informacoesEntreUsuarios", mult: "[0..1]", type: "Max140Text", fmt: "max 140 chars", what: "Free text the payer typed (or the QR's message)." }, "Pedido 4521"),
          ], "[0..1]"),
        ]),
      ]),
    ]),
  ],
  { attrs: { xmlns: "https://www.bcb.gov.br/pi/pacs.008/1.16" } },
);

export const PACS002: XNode = el(
  "Envelope",
  { iso: "SPI envelope", mult: "[1..1]", what: "Same wrapper; the namespace now names pacs.002 version 1.17." },
  [
    appHdr("87654321", MSGID_002, "pacs.002.spi.1.17", "2026-10-02T14:03:28.240Z"),
    wrap("Document", "Document (pacs.002.001.10)", "FIToFIPaymentStatusReportV10: the answer to a pacs.008 (or pacs.004).", [
      wrap("FIToFIPmtStsRpt", "FIToFIPaymentStatusReportV10", "Status report.", [
        wrap("GrpHdr", "GroupHeader91", "Header of this report.", [
          el("MsgId", { iso: "MessageIdentification", br: "idMensagem", mult: "[1..1]", type: "MsgIdType", fmt: "32 chars: M + ISPB + 23 alnum", what: "A new MsgId, minted by the receiver PSP (its own ISPB). Never the pacs.008's MsgId." }, MSGID_002),
          el("CreDtTm", { iso: "CreationDateTime", mult: "[1..1]", type: ISO_DT, fmt: DT_FMT, what: "When this pacs.002 was created." }, "2026-10-02T14:03:28.240Z"),
        ]),
        wrap("TxInfAndSts", "PaymentTransaction110", "One status per original transaction [1..unbounded].", [
          el("OrgnlInstrId", { iso: "OriginalInstructionIdentification", br: "idInstrucaoOriginal", mult: "[1..1]", type: "OrgnlInstrIdType", fmt: "32 chars, starts with E or D", what: "The id of the operation being answered: the EndToEndId for a pacs.008, the RtrId (D…) for a pacs.004." }, E2E),
          el("OrgnlEndToEndId", { iso: "OriginalEndToEndIdentification", br: "idFimAFimOriginal", mult: "[1..1]", type: "EndToEndIdType", fmt: "32 chars: E + ISPB + yyyyMMddHHmm + 11", what: "The EndToEndId of the payment. The idempotency key of pacs.002 and how both PSPs correlate the answer." }, E2E),
          el("TxSts", { iso: "TransactionStatus", br: "situacaoDaTransacao", mult: "[1..1]", type: "ExternalPaymentTransactionStatus1Code", fmt: "ACSP | RJCT | ACSC | ACCC", what: "Receiver PSP → SPI: ACSP (accepted, settle it) or RJCT (+ reason). SPI → payer: ACSC; SPI → receiver: ACCC." }, "ACSP"),
        ]),
      ]),
    ]),
  ],
  { attrs: { xmlns: "https://www.bcb.gov.br/pi/pacs.002/1.17" } },
);
