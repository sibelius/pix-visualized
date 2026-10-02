/** Fee classification, Regulamento do Pix arts. 87-A..87-F and 96: a Pix is presumed to be a *transferência* or a *compra*
 * from who pays, who receives, and how it was initiated. Transfers may only be charged to the payer, purchases only to the receiver;
 * PSPs never charge each other (art. 96), except the RCO on Saque/Troco (art. 96-B). Which users are exempt in practice is set by
 * Res. BCB nº 19/2020 (individuals don't pay to send or receive transfers, nor to send purchases) — check its current text. */

export type Party = "PF" | "PJ";
export type Form = "MANU" | "DICT" | "QRES" | "QRDN" | "APROX" | "INIC" | "AUTO" | "SAQUE";

export const FORMS: { value: Form; label: string }[] = [
  { value: "MANU", label: "manual account data" },
  { value: "DICT", label: "Pix key" },
  { value: "QRES", label: "static QR" },
  { value: "QRDN", label: "dynamic QR / Pix Cobrança" },
  { value: "APROX", label: "by tap (aproximação)" },
  { value: "INIC", label: "ITP with full receiver data" },
  { value: "AUTO", label: "Pix Automático" },
  { value: "SAQUE", label: "Saque / Troco" },
];

export type FeeIn = { payer: Party; receiver: Party; form: Form; nth: number; commercialAccount: boolean };
export type FeeOut = { finalidade: "transferência" | "compra" | "saque/troco" | "invalid"; why: string; chargeable: string; article: string };

export function classify(i: FeeIn): FeeOut {
  if (i.form === "SAQUE")
    return {
      finalidade: "saque/troco",
      why: "Made inside the Pix Saque / Pix Troco products, whatever the initiation form.",
      chargeable: "The agent (PJ) can't be charged for receiving the cash part (art. 87-F). The payer PSP pays the RCO to the FSS. The payer's own fees for withdrawals follow Res. BCB 19/2020 — check.",
      article: "art. 87-E",
    };
  if (i.form === "AUTO") {
    if (i.receiver === "PF") return { finalidade: "invalid", why: "Pix Automático receivers must have a CNPJ (PJ, MEI or EI).", chargeable: "—", article: "Guia Pix Automático §12" };
    return { finalidade: "compra", why: "Any Pix Automático transaction is a purchase.", chargeable: "Receiver only (the receiving PSP may charge the company). Charging the payer is forbidden.", article: "art. 87-B II b(3)" };
  }
  let fin: "transferência" | "compra";
  let why: string;
  let article: string;
  if (i.receiver === "PF") {
    if (i.commercialAccount) {
      fin = "compra";
      why = "The receiving PF account is contractually for commercial use, so the transfer presumption doesn't apply.";
      article = "art. 87-A sole §";
    } else if (i.payer === "PF") {
      if (i.form === "QRDN" || i.form === "APROX") {
        fin = "compra";
        why = "PF → PF via dynamic QR, Pix Cobrança or tap is a purchase.";
        article = "art. 87-B I a";
      } else if (i.nth <= 30) {
        fin = "transferência";
        why = `PF → PF by account data, key, static QR or full-data ITP: transfer, for the first 30 received in the month (this is #${i.nth}).`;
        article = "art. 87-A I a";
      } else {
        fin = "compra";
        why = `From the 31st such Pix received in the month (this is #${i.nth}) the PF receiver is treated as selling.`;
        article = "art. 87-B I b";
      }
    } else if (i.form === "MANU" || i.form === "DICT" || i.form === "INIC") {
      fin = "transferência";
      why = "PJ → PF by account data, key or full-data ITP (salary, refunds, …).";
      article = "art. 87-A I b";
    } else {
      fin = "compra";
      why = "PJ → PF by QR (static or dynamic) or tap.";
      article = "art. 87-B I c";
    }
  } else if (i.payer === "PF") {
    fin = "compra";
    why = "Anything a PF pays to a PJ is a purchase.";
    article = "art. 87-B II a";
  } else if (i.form === "MANU" || i.form === "DICT") {
    fin = "transferência";
    why = "PJ → PJ by account data or key.";
    article = "art. 87-A II";
  } else {
    fin = "compra";
    why = "PJ → PJ by ITP with full data, QR, Pix Cobrança or tap.";
    article = "art. 87-B II b";
  }
  const chargeable =
    fin === "transferência"
      ? i.payer === "PF"
        ? "Only the payer could be charged (art. 87-C), and an individual payer sending a transfer is exempt under Res. BCB 19/2020."
        : "Only the payer (the company) may be charged, per its PSP's published tariff table (art. 87-C)."
      : i.receiver === "PF"
        ? "Only the receiver may be charged (art. 87-D). That is how a PSP can bill an individual who sells through Pix."
        : "Only the receiver (the company) may be charged (art. 87-D). The payer pays nothing.";
  return { finalidade: fin, why, chargeable, article };
}
