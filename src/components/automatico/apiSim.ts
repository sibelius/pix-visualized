/**
 * A tiny in-memory receiver-PSP that validates API Pix (Pix Automático) requests with the violations listed in the
 * API Pix 2.10 spec (RecOperacaoInvalida, SolicRecOperacaoInvalida, CobROperacaoInvalida).
 */
import { ID_REC_RE } from "./ids";

export type ServerState = {
  recStatus: "CRIADA" | "APROVADA" | "CANCELADA";
  politica: "PERMITE_3R_7D" | "NAO_PERMITE";
  pendingSolic: boolean;
  cobrInCycle: boolean;
  tentativaAberta: boolean;
};

export const TODAY = "2026-10-02";
export const NOW = "2026-10-02T12:00:00.000Z";
export const KNOWN_REC = "RR8765432120261002Ab3dE9fGh1K";

export type EndpointKey = "solicrec" | "cobr" | "retentativa" | "patchRec" | "patchCobr";

export const ENDPOINTS: Record<EndpointKey, { method: string; path: string; scope: string; body: unknown; title: string }> = {
  solicrec: {
    method: "POST",
    path: "/solicrec",
    scope: "solicrec.write",
    title: "Jornada 1: send a confirmation request",
    body: {
      idRec: KNOWN_REC,
      calendario: { dataExpiracaoSolicitacao: "2026-10-20T23:59:59.000Z" },
      destinatario: { cpf: "12345678909", ispbParticipante: "11112222", agencia: "0001", conta: "1234567" },
    },
  },
  cobr: {
    method: "POST",
    path: "/cobr",
    scope: "cobr.write",
    title: "Create the November cobrança (txid set by the PSP)",
    body: {
      idRec: KNOWN_REC,
      infoAdicional: "Fatura 11/2026 — Plano Família 300 Mega",
      calendario: { dataDeVencimento: "2026-11-15" },
      valor: { original: "149.90" },
      ajusteDiaUtil: true,
      devedor: { email: "maria@example.com", logradouro: "Rua Fictícia 100", cidade: "Campinas", uf: "SP", cep: "13010000" },
      recebedor: { agencia: "0001", conta: "9988776", tipoConta: "CORRENTE" },
    },
  },
  retentativa: {
    method: "POST",
    path: "/cobr/fibra2026nov0000000000004417/retentativa/2026-11-19",
    scope: "cobr.write",
    title: "Ask for a retry after the due date (NTAG)",
    body: null,
  },
  patchRec: {
    method: "PATCH",
    path: `/rec/${KNOWN_REC}`,
    scope: "rec.write",
    title: "Receiver cancels the recorrência",
    body: { status: "CANCELADA" },
  },
  patchCobr: {
    method: "PATCH",
    path: "/cobr/fibra2026nov0000000000004417",
    scope: "cobr.write",
    title: "Receiver cancels one cobrança",
    body: { status: "CANCELADA" },
  },
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isDateTime = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));
const isMoney = (s: unknown) => typeof s === "string" && /^\d{1,10}\.\d{2}$/.test(s);

export type ApiResult = { status: number; body: unknown };

const problem = (kind: string, title: string, detail: string, violacoes: { razao: string; propriedade: string }[]): ApiResult => ({
  status: 400,
  body: { type: `https://pix.bcb.gov.br/api/v2/error/${kind}`, title, status: 400, detail, violacoes },
});

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

export function call(ep: EndpointKey, path: string, raw: string, st: ServerState): ApiResult {
  let body: unknown = null;
  if (ENDPOINTS[ep].body !== null) {
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return { status: 400, body: { title: "JSON inválido", status: 400, detail: (e as Error).message } };
    }
  }
  const v: { razao: string; propriedade: string }[] = [];

  if (ep === "solicrec") {
    const b = isObj(body) ? body : {};
    if (typeof b.idRec !== "string" || !ID_REC_RE.test(b.idRec)) v.push({ razao: "O campo solicrec.idRec não respeita o schema.", propriedade: "solicrec.idRec" });
    else if (b.idRec !== KNOWN_REC) return { status: 404, body: { type: "https://pix.bcb.gov.br/api/v2/error/NaoEncontrado", title: "Não Encontrado", status: 404, detail: "Recorrência não encontrada." } };
    const cal = isObj(b.calendario) ? b.calendario : null;
    if (!cal || !isDateTime(cal.dataExpiracaoSolicitacao)) v.push({ razao: "O objeto solicrec.calendario não respeita o schema.", propriedade: "solicrec.calendario" });
    else if (Date.parse(cal.dataExpiracaoSolicitacao as string) <= Date.parse(NOW))
      v.push({ razao: "O campo solicrec.calendario.dataExpiracaoSolicitacao é anterior à data de criação da solicitação da recorrência.", propriedade: "solicrec.calendario.dataExpiracaoSolicitacao" });
    else if (Date.parse(cal.dataExpiracaoSolicitacao as string) - Date.parse(NOW) > 30 * 86_400_000)
      v.push({ razao: "Prazo de expiração acima de 30 dias (regra do Guia de Implementação; a violação exata depende do PSP).", propriedade: "solicrec.calendario.dataExpiracaoSolicitacao" });
    const d = isObj(b.destinatario) ? b.destinatario : null;
    const docOk = d && ((typeof d.cpf === "string" && /^\d{11}$/.test(d.cpf)) !== (typeof d.cnpj === "string" && /^[0-9A-Z]{12}\d{2}$/.test(d.cnpj)));
    if (!d || !docOk || typeof d.conta !== "string" || typeof d.ispbParticipante !== "string" || !/^[0-9A-Z]{8}$/.test(d.ispbParticipante))
      v.push({ razao: "O objeto solicrec.destinatario não respeita o schema.", propriedade: "solicrec.destinatario" });
    if (st.pendingSolic) v.push({ razao: "Existe uma solicitação ativa referente ao mesmo solicrec.idRec.", propriedade: "solicrec.idRec" });
    if (st.recStatus !== "CRIADA")
      v.push({ razao: "Não é possível criar uma solicitação para uma recorrência que já foi confirmada ou está pendente de confirmação pelo usuário pagador.", propriedade: "solicrec.idRec" });
    if (v.length) return problem("SolicRecOperacaoInvalida", "Solicitação de recorrência inválida.", "A requisição não respeita o schema ou está semanticamente errada.", v);
    return {
      status: 201,
      body: {
        idSolicRec: "SC8765432120261002sQ7Lm2Np0Xa",
        idRec: KNOWN_REC,
        calendario: cal,
        status: "CRIADA",
        destinatario: d,
        atualizacao: [{ status: "CRIADA", data: NOW }],
        recPayload: { idRec: KNOWN_REC, vinculo: { contrato: "CT-2026-004417", objeto: "Plano Família 300 Mega" }, calendario: { dataInicial: "2026-11-15", periodicidade: "MENSAL" } },
      },
    };
  }

  if (ep === "cobr") {
    const b = isObj(body) ? body : {};
    if (typeof b.idRec !== "string" || !ID_REC_RE.test(b.idRec)) v.push({ razao: "O campo cobr.idRec não respeita o schema.", propriedade: "cobr.idRec" });
    if (b.infoAdicional !== undefined && (typeof b.infoAdicional !== "string" || b.infoAdicional.length > 140)) v.push({ razao: "O campo cobr.infoAdicional não respeita o schema.", propriedade: "cobr.infoAdicional" });
    const cal = isObj(b.calendario) ? b.calendario : null;
    if (!cal || !isDate(cal.dataDeVencimento)) v.push({ razao: "O objeto cobr.calendario não respeita o schema.", propriedade: "cobr.calendario" });
    else if ((cal.dataDeVencimento as string) < TODAY) v.push({ razao: "O campo cobr.calendario.dataDeVencimento é anterior à data de criação da cobrança.", propriedade: "cobr.calendario.dataDeVencimento" });
    const val = isObj(b.valor) ? b.valor : null;
    if (!val || !isMoney(val.original)) v.push({ razao: "O campo cobr.valor não respeita o schema.", propriedade: "cobr.valor" });
    if (typeof b.ajusteDiaUtil !== "boolean") v.push({ razao: "O campo cobr.ajusteDiaUtil é obrigatório (boolean).", propriedade: "cobr.ajusteDiaUtil" });
    const r = isObj(b.recebedor) ? b.recebedor : null;
    if (!r || typeof r.conta !== "string" || !["CORRENTE", "POUPANCA", "PAGAMENTO"].includes(String(r.tipoConta)))
      v.push({ razao: "O objeto cobr.recebedor não respeita o schema.", propriedade: "cobr.recebedor" });
    if (st.cobrInCycle)
      v.push({ razao: "Existe uma CobR com status diferente de REJEITADA e CANCELADA referente ao mesmo cobr.idRec com calendario.dataDeVencimento no mesmo ciclo.", propriedade: "cobr.calendario.dataDeVencimento" });
    if (st.recStatus !== "APROVADA") v.push({ razao: `A recorrência está ${st.recStatus}: só recorrências APROVADA aceitam cobranças.`, propriedade: "cobr.idRec" });
    if (v.length) return problem("CobROperacaoInvalida", "Operação inválida.", "A cobrança não respeita o schema.", v);
    return {
      status: 201,
      body: {
        idRec: b.idRec,
        txid: "fibra2026nov0000000000004417",
        calendario: { criacao: TODAY, dataDeVencimento: cal!.dataDeVencimento },
        valor: val,
        ajusteDiaUtil: b.ajusteDiaUtil,
        status: "CRIADA",
        politicaRetentativa: st.politica,
        recebedor: { cnpj: "11222333000181", nome: "Fibra Exemplo Telecom", ...r },
        devedor: { cpf: "12345678909", nome: "Maria Fictícia", ...(isObj(b.devedor) ? b.devedor : {}) },
        atualizacao: [{ status: "CRIADA", data: NOW }],
      },
    };
  }

  if (ep === "retentativa") {
    const m = path.match(/^\/cobr\/([a-zA-Z0-9]{26,35})\/retentativa\/(.+)$/);
    if (!m) return { status: 404, body: { title: "Não Encontrado", status: 404, detail: "Cobrança não encontrada para o txid informado." } };
    const data = m[2];
    if (!isDate(data)) v.push({ razao: "O parâmetro data não respeita o schema.", propriedade: "data" });
    else if (data <= TODAY) v.push({ razao: "O parâmetro data não corresponde a uma data futura.", propriedade: "data" });
    if (st.politica === "NAO_PERMITE") v.push({ razao: "A política configurada na recorrência não permite retentativa de cobrança.", propriedade: "politicaRetentativa" });
    if (st.tentativaAberta) v.push({ razao: "Existe uma tentativa com status SOLICITADA ou AGENDADA.", propriedade: "tentativas" });
    if (v.length) return problem("CobROperacaoInvalida", "Operação inválida.", "A retentativa não pode ser solicitada.", v);
    return {
      status: 201,
      body: {
        idRec: KNOWN_REC,
        txid: m[1],
        status: "ATIVA",
        politicaRetentativa: st.politica,
        tentativas: [
          { dataLiquidacao: "2026-11-16", tipo: "AGND", endToEndId: "E8765432120261116150000000000001", status: "EXPIRADA" },
          { dataLiquidacao: data, tipo: "NTAG", endToEndId: `E87654321${String(data).replaceAll("-", "")}150000000000002`, status: "SOLICITADA" },
        ],
        nota: `pain.013 NTAG goes out now; settlement must be ≤ ${addDays("2026-11-16", 7)} and before the next cycle`,
      },
    };
  }

  if (ep === "patchRec") {
    const b = isObj(body) ? body : {};
    if (b.status !== "CANCELADA") v.push({ razao: "O campo rec.status não respeita o schema.", propriedade: "rec.status" });
    if (st.recStatus === "CANCELADA") v.push({ razao: "A recorrência encontra-se expirada, cancelada ou rejeitada.", propriedade: "rec.status" });
    if (v.length) return problem("RecOperacaoInvalida", "Recorrência inválida.", "A requisição não respeita o schema ou está semanticamente errada.", v);
    return {
      status: 200,
      body: {
        idRec: KNOWN_REC,
        status: "CANCELADA",
        encerramento: { cancelamento: { solicitante: "USUARIO_RECEBEDOR", codigo: "SLCR", descricao: "Cancelamento solicitado pelo usuário recebedor" } },
        nota: st.recStatus === "APROVADA" ? "pain.011 SLCR goes to the payer PSP; schedules from D+1 (D+2 after 22h) are cancelled with camt.055" : "a pending pain.009, if any, is cancelled with pain.011",
      },
    };
  }

  // patchCobr
  const b = isObj(body) ? body : {};
  if (b.status !== "CANCELADA") v.push({ razao: "O campo cobr.status não respeita o schema.", propriedade: "cobr.status" });
  if (TODAY >= "2026-11-16") v.push({ razao: "Não é possível cancelar uma cobrança em uma data igual ou maior que a data prevista da primeira tentativa de liquidação.", propriedade: "cobr.status" });
  if (v.length) return problem("CobROperacaoInvalida", "Operação inválida.", "A cobrança não pode ser cancelada.", v);
  return {
    status: 200,
    body: {
      txid: "fibra2026nov0000000000004417",
      status: "CANCELADA",
      encerramento: { cancelamento: { solicitante: "USUARIO_RECEBEDOR", codigo: "SLCR", descricao: "Cancelada pelo recebedor" } },
      nota: "if already scheduled, camt.055 SLCR must reach the payer PSP by 22:00 of D-1; the payer is notified",
    },
  };
}
