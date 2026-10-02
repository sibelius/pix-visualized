/** State machines of API Pix entities (Manual de Padrões, Anexo I §5.1; openapi v2.10.0 enums). */

export type MState = { id: string; x: number; y: number; final?: boolean; note: string };
export type MEdge = { from: string; to: string; label: string; via: string; bend?: number };
export type Machine = { key: string; title: string; start: string; states: MState[]; edges: MEdge[]; hint: string };

export const MACHINES: Machine[] = [
  {
    key: "cob",
    title: "cob / cobv record",
    start: "ATIVA",
    hint: "The status is the status of the charge record: an expired cob or an overdue cobv is still ATIVA. Expiry is computed from calendario, not stored in status.",
    states: [
      { id: "ATIVA", x: 120, y: 120, note: "created and not paid nor removed (may already be expired!)" },
      { id: "CONCLUIDA", x: 470, y: 45, final: true, note: "a Pix with this txid settled; no further payment accepted. Final." },
      { id: "REMOVIDA_PELO_USUARIO_RECEBEDOR", x: 470, y: 125, final: true, note: "you removed it via PATCH status. Final." },
      { id: "REMOVIDA_PELO_PSP", x: 470, y: 205, final: true, note: "the PSP removed it (e.g. key deleted, fraud). Final." },
    ],
    edges: [
      { from: "ATIVA", to: "ATIVA", label: "PATCH/PUT a field (revisao+1)", via: "PATCH /cob/{txid}" },
      { from: "ATIVA", to: "ATIVA", label: "calendario.expiracao elapses", via: "time passes — status unchanged" },
      { from: "ATIVA", to: "CONCLUIDA", label: "pacs.008 with this txid settles", via: "SPI credit → PSP recebedor" },
      { from: "ATIVA", to: "REMOVIDA_PELO_USUARIO_RECEBEDOR", label: "PATCH status=REMOVIDA_PELO_USUARIO_RECEBEDOR", via: "PATCH /cob/{txid}" },
      { from: "ATIVA", to: "REMOVIDA_PELO_PSP", label: "PSP removes the charge", via: "PSP-internal" },
    ],
  },
  {
    key: "dev",
    title: "devolução",
    start: "SOLICITADA",
    hint: "PUT /pix/{e2eid}/devolucao/{id} returns 201 with EM_PROCESSAMENTO. The final status arrives later (pacs.002 for the pacs.004) and also triggers the webhook.",
    states: [
      { id: "SOLICITADA", x: 70, y: 125, note: "your PUT (not a real status — just the request)" },
      { id: "EM_PROCESSAMENTO", x: 250, y: 125, note: "pacs.004 sent to the SPI, waiting for settlement" },
      { id: "DEVOLVIDO", x: 480, y: 60, final: true, note: "settled by the SPI; webhook fires" },
      { id: "NAO_REALIZADO", x: 480, y: 190, final: true, note: "could not settle (e.g. insufficient balance); webhook fires; motivo explains" },
    ],
    edges: [
      { from: "SOLICITADA", to: "EM_PROCESSAMENTO", label: "PUT accepted (201)", via: "PUT /pix/{e2eid}/devolucao/{id}" },
      { from: "EM_PROCESSAMENTO", to: "DEVOLVIDO", label: "SPI settles the pacs.004", via: "pacs.002 ACSP/ACCC" },
      { from: "EM_PROCESSAMENTO", to: "NAO_REALIZADO", label: "SPI rejects (e.g. no balance)", via: "pacs.002 RJCT" },
    ],
  },
  {
    key: "rec",
    title: "rec (Pix Automático)",
    start: "CRIADA",
    hint: "REJEITADA only happens in Jornada 1 (the payer declines a solicitação). In Jornadas 2–4 the payer approves by reading a (composite) QR.",
    states: [
      { id: "CRIADA", x: 90, y: 125, note: "POST /rec done; awaiting the payer's authorization" },
      { id: "APROVADA", x: 290, y: 60, note: "payer authorized at their PSP; cobr can be scheduled" },
      { id: "REJEITADA", x: 290, y: 200, final: true, note: "payer declined (Jornada 1 only)" },
      { id: "EXPIRADA", x: 490, y: 60, final: true, note: "calendario.dataFinal passed" },
      { id: "CANCELADA", x: 490, y: 175, final: true, note: "cancelled by the recebedor (PATCH status) or by the payer" },
    ],
    edges: [
      { from: "CRIADA", to: "APROVADA", label: "payer approves (J1 solicrec / J2–J4 QR)", via: "pain.012 accepted" },
      { from: "CRIADA", to: "REJEITADA", label: "payer rejects solicitação (J1)", via: "pain.012 rejected" },
      { from: "APROVADA", to: "EXPIRADA", label: "dataFinal passes", via: "time" },
      { from: "APROVADA", to: "CANCELADA", label: "recebedor or payer cancels", via: "PATCH /rec/{idRec} / pain.011" },
      { from: "CRIADA", to: "CANCELADA", label: "recebedor cancels before approval", via: "PATCH /rec/{idRec}" },
    ],
  },
  {
    key: "cobr",
    title: "cobr (recurring charge)",
    start: "CRIADA",
    hint: "Cancelling a scheduled charge must reach the payer's PSP by 22:00 the day before the due date. Retries after the due date only exist with politicaRetentativa PERMITE_3R_7D.",
    states: [
      { id: "CRIADA", x: 80, y: 125, note: "PUT /cobr/{txid} accepted by your PSP" },
      { id: "ATIVA", x: 260, y: 125, note: "sent to the payer's PSP (pain.013) and scheduled" },
      { id: "REJEITADA", x: 260, y: 215, final: true, note: "payer's PSP refused to schedule it" },
      { id: "CONCLUIDA", x: 480, y: 45, final: true, note: "paid (on the due date or a retry)" },
      { id: "EXPIRADA", x: 480, y: 125, final: true, note: "every allowed attempt failed" },
      { id: "CANCELADA", x: 480, y: 210, final: true, note: "cancelled by recebedor (PATCH) or payer" },
    ],
    edges: [
      { from: "CRIADA", to: "ATIVA", label: "payer PSP schedules it", via: "pain.014 accepted" },
      { from: "CRIADA", to: "REJEITADA", label: "payer PSP rejects scheduling", via: "pain.014 rejected" },
      { from: "ATIVA", to: "ATIVA", label: "attempt fails → retry (PERMITE_3R_7D)", via: "POST /cobr/{txid}/retentativa/{data}" },
      { from: "ATIVA", to: "CONCLUIDA", label: "debit settles", via: "pacs.008 (Pix Automático)" },
      { from: "ATIVA", to: "EXPIRADA", label: "all attempts exhausted", via: "time" },
      { from: "ATIVA", to: "CANCELADA", label: "cancel before 22:00 of D-1", via: "PATCH /cobr/{txid} → camt.055" },
      { from: "CRIADA", to: "CANCELADA", label: "recebedor cancels", via: "PATCH /cobr/{txid}" },
    ],
  },
];

/** Devolução admission rules (PixDevolucaoInvalida violations). */
export function devolucaoCheck(o: { pixValor: number; prior: number[]; valor: number; days: number; natureza: string; saque: boolean }) {
  const used = o.prior.reduce((a, b) => a + b, 0);
  const errs: string[] = [];
  if (!(o.valor > 0)) errs.push("devolucao.valor não respeita o schema");
  if (used + o.valor > o.pixValor + 1e-9) errs.push(`excederia o valor do pix originário (${used.toFixed(2)} já devolvido + ${o.valor.toFixed(2)} > ${o.pixValor.toFixed(2)})`);
  if (o.days > 90) errs.push("viola a janela de 90 dias desde a liquidação do pix original");
  if (!o.saque && o.natureza === "RETIRADA") errs.push("natureza RETIRADA só se aplica a Pix Saque / valor do troco em Pix Troco");
  return { ok: errs.length === 0, errs, remaining: Math.max(0, o.pixValor - used) };
}
