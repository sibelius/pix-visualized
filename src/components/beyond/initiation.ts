/** formaDeIniciacao (pacs.008 MndtRltdInf/Tp/LclInstrm/Prtry) and the fields that depend on it, paraphrased from the
 * Catálogo de Mensagens do SPI v5.13 (pacs.008.spi.1.16) fill rules. */

export type Lcl = "MANU" | "DICT" | "QRES" | "QRDN" | "INIC" | "APES" | "APDN" | "AUTO";

export const LCL: Record<Lcl, { name: string; txid: "none" | "static" | "dynamic" | "inic" | "auto"; proxy: boolean; itpOnly?: boolean }> = {
  MANU: { name: "manual account data", txid: "none", proxy: false },
  DICT: { name: "manual Pix key", txid: "none", proxy: true },
  QRES: { name: "static QR Code", txid: "static", proxy: true },
  QRDN: { name: "dynamic QR Code", txid: "dynamic", proxy: true },
  INIC: { name: "initiation service with full receiver data", txid: "inic", proxy: false, itpOnly: true },
  APES: { name: "tap, static payload", txid: "static", proxy: true },
  APDN: { name: "tap, dynamic payload", txid: "dynamic", proxy: true },
  AUTO: { name: "Pix Automático", txid: "auto", proxy: false },
};

export type InitIn = { lcl: Lcl; viaItp: boolean; txid: string; itpCnpj: string };

export type Check = { ok: boolean; text: string };

export function validate(i: InitIn): { checks: Check[]; txidPresent: boolean } {
  const m = LCL[i.lcl];
  const t = i.txid;
  const alnum = /^[a-zA-Z0-9]*$/.test(t);
  const checks: Check[] = [];
  let txidPresent = t.length > 0;
  switch (m.txid) {
    case "none":
      checks.push({ ok: t.length === 0, text: `${i.lcl}: TxId (idConciliacaoRecebedor) must NOT be filled.` });
      break;
    case "static":
      checks.push({ ok: alnum && t.length <= 25, text: `${i.lcl}: copy the static QR's TxId (tag 62-05) if it has one — up to 25 alphanumerics; omit otherwise. ('***' means none.)` });
      break;
    case "dynamic":
      checks.push({ ok: alnum && t.length >= 26 && t.length <= 35, text: `${i.lcl}: mandatory, the txid from the dynamic payload JSON, 26–35 alphanumerics (got ${t.length}).` });
      break;
    case "inic":
      checks.push({ ok: alnum && t.length >= 1 && t.length <= 25, text: `INIC: mandatory, the TxId received from the initiation service, up to 25 alphanumerics (got ${t.length}).` });
      break;
    case "auto":
      if (i.viaItp) checks.push({ ok: t.length === 0, text: "AUTO with cnpjIniciadorPagamento filled (Pix Automático via Open Finance): TxId must NOT be filled (IN 513 as amended by IN 743/2026)." });
      else checks.push({ ok: alnum && t.length >= 26 && t.length <= 35, text: `AUTO: TxId = the PmtInfId of the pain.013 that originated it, 26–35 alphanumerics (got ${t.length}).` });
      break;
  }
  if (m.itpOnly) checks.push({ ok: i.viaItp, text: "INIC only exists when an initiation service (ITP) started the Pix and the payer PSP received all receiver data from it." });
  if (i.viaItp) checks.push({ ok: /^[0-9A-Z]{12}[0-9]{2}$/.test(i.itpCnpj), text: "Via ITP: InitgPty/Id/OrgId/Othr/Id = cnpjIniciadorPagamento is mandatory, whatever the LclInstrm (14 chars, alphanumeric CNPJ allowed)." });
  else checks.push({ ok: true, text: "Not via ITP: InitgPty must be absent." });
  if (m.txid === "none") txidPresent = false;
  return { checks, txidPresent };
}

export function pacs008(i: InitIn) {
  const m = LCL[i.lcl];
  const auto = i.lcl === "AUTO";
  const tx = i.txid && !(m.txid === "none") && !(auto && i.viaItp) ? `\n    <TxId>${i.txid}</TxId>` : "";
  const initg = i.viaItp ? `\n  <InitgPty><Id><OrgId><Othr><Id>${i.itpCnpj}</Id></Othr></OrgId></Id></InitgPty>` : "";
  const prxy = m.proxy ? `\n    <Prxy><Id>+5511987654321</Id></Prxy>` : "";
  return `<GrpHdr>
  <MsgId>M9999000420261002143055aB3dE5fG7hI</MsgId>
  <PmtTpInf>
    <InstrPrty>${auto ? "NORM" : "HIGH"}</InstrPrty>
    <SvcLvl><Prtry>${auto ? "PAGAGD" : "PAGPRI"}</Prtry></SvcLvl>
  </PmtTpInf>
</GrpHdr>
<CdtTrfTxInf>
  <PmtId>
    <EndToEndId>E9999000420261002143012345abcdef</EndToEndId>${tx}
  </PmtId>
  <IntrBkSttlmAmt Ccy="BRL">89.90</IntrBkSttlmAmt>
  <MndtRltdInf><Tp><LclInstrm><Prtry>${i.lcl}</Prtry></LclInstrm></Tp></MndtRltdInf>${initg}
  <CdtrAcct>
    <Id><Othr><Id>0012345678</Id><Issr>0001</Issr></Othr></Id>
    <Tp><Cd>CACC</Cd></Tp>${prxy}
  </CdtrAcct>
  <Purp><Cd>IPAY</Cd></Purp>
</CdtTrfTxInf>`;
}

export const SAMPLE_TXID: Record<Lcl, string> = {
  MANU: "",
  DICT: "",
  QRES: "PEDIDO4471",
  QRDN: "9d36b84f6c7a4e9c8a1b2c3d4e5f6a7b",
  INIC: "ITPREF20261002X9",
  APES: "PEDIDO4471",
  APDN: "9d36b84f6c7a4e9c8a1b2c3d4e5f6a7b",
  AUTO: "7f733863543b4a16b516d839bd4bc34e",
};
