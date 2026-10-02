/** Reconciliation model: received Pix (webhook or GET /pix) matched against your charges by txid. */

export type LCob = { txid: string; kind: "cob" | "cobv"; valor: string; modalidadeAlteracao?: 0 | 1; label: string; status: "ATIVA" | "CONCLUIDA"; paid: string[] };
export type InPix = {
  e2e: string;
  txid?: string;
  valor: string;
  via: "webhook" | "sweep-only";
  why?: string;
  componentes?: Record<string, string>;
  pagador: string;
};
export type Verdict = { kind: "matched" | "matched-edited" | "matched-cobv" | "duplicate" | "static" | "no-txid" | "unknown"; text: string; action?: string; tone: "ok" | "warn" | "bad" | "info" };

export const initialCobs = (): LCob[] => [
  { txid: "pedido4471xQmZt2LkVbN8rWcYfHsA", kind: "cob", valor: "89.90", label: "order 4471 (checkout)", status: "ATIVA", paid: [] },
  { txid: "gorjeta0091mesa12Lk3VbN8rWcYfH", kind: "cob", valor: "0.00", modalidadeAlteracao: 1, label: "tip jar, payer types the amount", status: "ATIVA", paid: [] },
  { txid: "pedido4472xP9sd2LkVbN8rWcYfHsB", kind: "cob", valor: "250.00", label: "order 4472", status: "ATIVA", paid: [] },
  { txid: "boleto2026out0007Xc3PqRtYuIoP1", kind: "cobv", valor: "123.45", label: "school fee (due 2026-09-30)", status: "ATIVA", paid: [] },
  { txid: "pedido4473xWw8e2LkVbN8rWcYfHsC", kind: "cob", valor: "42.00", label: "order 4473", status: "ATIVA", paid: [] },
];

export const STREAM: InPix[] = [
  { e2e: "E87654321202610021301aB3dE5fG7hJ", txid: "pedido4471xQmZt2LkVbN8rWcYfHsA", valor: "89.90", via: "webhook", pagador: "***.456.789-**" },
  { e2e: "E11122233202610021302kL9mN0pQ1rS", txid: "gorjeta0091mesa12Lk3VbN8rWcYfH", valor: "15.00", via: "webhook", pagador: "***.111.222-**" },
  { e2e: "E87654321202610021303tU2vW4xY6zA", txid: "boleto2026out0007Xc3PqRtYuIoP1", valor: "140.45", via: "webhook", pagador: "***.333.444-**", componentes: { original: "123.45", multa: "15.00", juros: "2.00" } },
  { e2e: "E99988877202610021304bC5dE7fG9hJ", txid: "CAIXA02", valor: "7.50", via: "webhook", pagador: "***.555.666-**" },
  { e2e: "E87654321202610021305kL1mN3pQ5rS", valor: "250.00", via: "sweep-only", why: "no txid (paid by typing the key) → never notified by webhook", pagador: "***.777.888-**" },
  { e2e: "E55566677202610021306tU7vW9xY1zA", txid: "pedido4473xWw8e2LkVbN8rWcYfHsC", valor: "42.00", via: "sweep-only", why: "webhook gave up after the PSP's retries", pagador: "***.999.000-**" },
  { e2e: "E11122233202610021307bC3dE5fG7hJ", txid: "pedido4471xQmZt2LkVbN8rWcYfHsA", valor: "89.90", via: "webhook", pagador: "***.456.789-**" },
  { e2e: "E87654321202610021308kL5mN7pQ9rS", txid: "pedido9999xZZZZ2LkVbN8rWcYfHsZ", valor: "19.90", via: "webhook", pagador: "***.123.123-**" },
];

export function classify(cobs: LCob[], px: InPix): Verdict {
  if (!px.txid) return { kind: "no-txid", text: "No txid: cannot match by key. Only visible through GET /pix?inicio&fim (txIdPresente=false).", action: "match by amount + payer, or PUT /pix/{e2eid}/devolucao/{id}", tone: "warn" };
  const c = cobs.find((x) => x.txid === px.txid);
  if (!c) {
    if (px.txid.length < 26) return { kind: "static", text: `txid "${px.txid}" is shorter than 26: a static QR. Many Pix can share it; the PSP never registered it.`, action: "book against the static QR / SKU", tone: "info" };
    return { kind: "unknown", text: "txid matches no charge of yours (e.g. created by another system, or a POST /cob whose response was lost).", action: "investigate: GET /cob/{txid}; refund if unexplained", tone: "bad" };
  }
  if (c.status === "CONCLUIDA") return { kind: "duplicate", text: `Second Pix for ${c.label} (already CONCLUIDA). A cob may end up associated with more than one Pix.`, action: `refund: PUT /pix/${px.e2e.slice(0, 10)}…/devolucao/{id} valor ${px.valor}`, tone: "bad" };
  if (c.kind === "cobv" && px.componentes) return { kind: "matched-cobv", text: `Paid late: componentesValor explains ${px.valor} = ${Object.entries(px.componentes).map(([k, v]) => `${k} ${v}`).join(" + ")}.`, tone: "ok" };
  if (px.valor !== c.valor) {
    if (c.modalidadeAlteracao === 1) return { kind: "matched-edited", text: `Amount ${px.valor} ≠ ${c.valor}, allowed: modalidadeAlteracao = 1 lets the payer edit it.`, tone: "ok" };
    return { kind: "unknown", text: `Amount ${px.valor} ≠ ${c.valor} with modalidadeAlteracao = 0.`, action: "investigate", tone: "bad" };
  }
  return { kind: "matched", text: `Matched ${c.label}: same txid, same valor.`, tone: "ok" };
}
