/** Pix Saque / Pix Troco rules: IN BCB 512 (arts. 5–6), Regulamento arts. 11-F..11-N and 96-B (RCO, as amended by Res. BCB 559/2026, effective 1 Jul 2026),
 * and the pacs.008 (Catálogo v5.13, pacs.008.spi.1.16) fields that carry them. */

export type SaqueKind = "saque" | "troco";
/** modalidadeAgente in pacs.008 RmtInf/Strd/RfrdDocInf/Tp/CdOrPrtry/Prtry. AGPSS is deprecated in API Pix 2.10 in favour of AGFSS. */
export type Modalidade = "AGTEC" | "AGTOT" | "AGFSS";

export const MODALIDADES: Record<Modalidade, { label: string; rco: number; agentMin: number | null; desc: string }> = {
  AGTEC: {
    label: "AGTEC · commercial establishment",
    rco: 1.5,
    agentMin: 0.4,
    desc: "Agent is a shop of any kind (bakery, supermarket, gas station).",
  },
  AGTOT: {
    label: "AGTOT · other PJ / correspondent",
    rco: 3.0,
    agentMin: null,
    desc: "Agent is another legal entity providing auxiliary financial services, or a correspondente no País.",
  },
  AGFSS: {
    label: "AGFSS · facilitator itself",
    rco: 2.25,
    agentMin: null,
    desc: "The facilitador de serviço de saque (FSS) hands out the cash directly (its own ATM network, for example).",
  },
};

export type SaqueInput = {
  kind: SaqueKind;
  modalidade: Modalidade;
  purchase: number;
  cash: number;
  hour: number;
  /** PSP-configured PF limit for the day period (IN 512 art. 6: between R$1,000 and R$3,000 unless the user asks otherwise) */
  userDayLimit: number;
  /** cash already withdrawn through Saque/Troco in the current period */
  usedInPeriod: number;
  fssIspb: string;
};

export type Rule = { ok: boolean; text: string; warn?: boolean };

export function isDay(hour: number) {
  return hour >= 6 && hour < 20;
}

export function evaluateSaque(i: SaqueInput) {
  const day = isDay(i.hour);
  const perTxCap = day ? 3000 : 1000;
  const periodLimit = day ? i.userDayLimit : 1000;
  const total = i.kind === "troco" ? i.purchase + i.cash : i.cash;
  const rules: Rule[] = [];
  rules.push({ ok: i.cash > 0, text: "Cash amount must be positive (it is what the agent hands over)." });
  if (i.kind === "troco") rules.push({ ok: i.purchase > 0, text: "Pix Troco needs a purchase > 0: the Pix covers purchase + cash." });
  rules.push({
    ok: i.cash <= perTxCap,
    text: `Per-transaction cash cap for agents and FSS (IN 512 art. 5): ${day ? "R$3,000 between 6h and 20h" : "R$1,000 between 20h and 6h"}.`,
  });
  rules.push({
    ok: i.userDayLimit >= 1000 && i.userDayLimit <= 3000,
    warn: false,
    text: "PSP default day-period limit for a PF payer must sit between R$1,000 and R$3,000 (art. 6, I) unless the user explicitly asked otherwise.",
  });
  rules.push({
    ok: i.usedInPeriod + i.cash <= periodLimit,
    text: `Payer's ${day ? "day" : "night"}-period Saque/Troco limit ${day ? `(R$${i.userDayLimit.toLocaleString("en-US")})` : "(must be R$1,000 at night)"}: used ${i.usedInPeriod} + ${i.cash}. For Troco only the cash part counts (art. 6 §1).`,
  });
  rules.push({ ok: /^[0-9A-Z]{8}$/.test(i.fssIspb), text: "facilitadorDoServicoDeSaque must be the 8-char ISPB of the FSS participant." });
  if (i.kind === "troco" && i.modalidade === "AGFSS")
    rules.push({
      ok: true,
      warn: true,
      text: "Troco happens at a purchase in an agent shop (art. 11-G); a facilitator paying out directly is unusual for Troco. Check the Regulamento.",
    });
  const ok = rules.every((r) => r.ok);
  const m = MODALIDADES[i.modalidade];
  return { ok, rules, total, day, perTxCap, periodLimit, rco: m.rco, agentMin: m.agentMin };
}

const amt = (x: number) => x.toFixed(2);

export function saqueXml(i: SaqueInput) {
  const total = i.kind === "troco" ? i.purchase + i.cash : i.cash;
  const purp = i.kind === "troco" ? "GSCB" : "OTHR";
  const adj =
    i.kind === "troco"
      ? `          <AdjstmntAmtAndRsn>
            <Amt Ccy="BRL">${amt(i.purchase)}</Amt>
            <Rsn>VLCP</Rsn>
          </AdjstmntAmtAndRsn>
          <AdjstmntAmtAndRsn>
            <Amt Ccy="BRL">${amt(i.cash)}</Amt>
            <Rsn>VLDN</Rsn>
          </AdjstmntAmtAndRsn>`
      : `          <AdjstmntAmtAndRsn>
            <Amt Ccy="BRL">${amt(i.cash)}</Amt>
            <Rsn>VLDN</Rsn>
          </AdjstmntAmtAndRsn>`;
  return `<CdtTrfTxInf>
  <PmtId>
    <EndToEndId>E9999000420261002143012345abcdef</EndToEndId>
    <!-- InstrId must NOT be filled when Purp is GSCB or OTHR -->
    <TxId>${i.kind === "troco" ? "saqtroco7f3a9c2e4b1d8f6a0c5e2b" : "saque8d1f4a7c0e3b6d9f2a5c8e1b"}</TxId>
  </PmtId>
  <IntrBkSttlmAmt Ccy="BRL">${amt(total)}</IntrBkSttlmAmt>
  <!-- ${i.kind === "troco" ? "GSCB: purchase + cash" : "OTHR: cash only"} -->
  <MndtRltdInf><Tp><LclInstrm><Prtry>QRDN</Prtry></LclInstrm></Tp></MndtRltdInf>
  <Cdtr><Id><PrvtId><Othr><Id>12345678000195</Id></Othr></PrvtId></Id></Cdtr>
  <Purp><Cd>${purp}</Cd></Purp>
  <RmtInf>
    <Strd>
      <RfrdDocInf>
        <Tp>
          <CdOrPrtry><Prtry>${i.modalidade}</Prtry></CdOrPrtry>
          <Issr>${i.fssIspb}</Issr>
        </Tp>
      </RfrdDocInf>
      <RfrdDocAmt>
${adj}
      </RfrdDocAmt>
    </Strd>
  </RmtInf>
</CdtTrfTxInf>`;
}
