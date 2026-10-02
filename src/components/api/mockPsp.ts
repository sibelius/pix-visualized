/**
 * An in-memory mock of a PSP recebedor implementing a useful subset of the API Pix v2.10.0
 * (github.com/bacen/pix-api). Validation rules and error types follow the spec's
 * "Tratamento de erros" section; responses follow the schemas/examples.
 * Deterministic: the clock starts at a fixed instant and ticks 1.2s per request; ids come from a seeded rng.
 */
import { rng, type Rng } from "@/lib/random";
import { dynamicBrCode } from "./brcode";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Obj = { [k: string]: Json };

export const OWNED_KEYS = ["7d9f0335-8dcc-4054-9bf9-0dbd61d36906", "financeiro@empresa.example.com", "12345678000195"];
export const RECEBEDOR_CNPJ = "12345678000195";
const ISPB = "12345678"; // fictional PSP recebedor ISPB
const PAYER_ISPB = "87654321";
const ERR = "https://pix.bcb.gov.br/api/v2/error/";
const MONEY = /^\d{1,10}\.\d{2}$/;
const TXID = /^[a-zA-Z0-9]{26,35}$/;
const T0 = Date.UTC(2026, 9, 2, 13, 0, 0);

export type Violation = { razao: string; propriedade: string; valor?: string };
export type Res = { status: number; body?: Json; contentType?: string; note?: string };

export type CobRec = {
  kind: "cob" | "cobv";
  txid: string;
  revisao: number;
  status: "ATIVA" | "CONCLUIDA" | "REMOVIDA_PELO_USUARIO_RECEBEDOR" | "REMOVIDA_PELO_PSP";
  data: Obj; // calendario/devedor/valor/chave/solicitacaoPagador/infoAdicionais (client fields)
  criacao: string;
  locId: number;
  history: Obj[];
  pix: string[]; // e2eids
};
export type LocRec = { id: number; location: string; tipoCob: "cob" | "cobv"; criacao: string; txid?: string };
export type DevRec = { id: string; rtrId: string; valor: string; natureza: string; descricao?: string; solicitacao: string; liquidacao?: string; status: "EM_PROCESSAMENTO" | "DEVOLVIDO" | "NAO_REALIZADO"; motivo?: string; settleAt: number };
export type PixRec = { endToEndId: string; txid?: string; valor: string; horario: string; infoPagador?: string; chave: string; devolucoes: DevRec[] };
export type RecRec = { idRec: string; data: Obj; status: string; criacao: string };
export type Delivery = { at: string; url: string; body: Json };

export type Psp = {
  t: number;
  r: Rng;
  cobs: Map<string, CobRec>;
  locs: Map<number, LocRec>;
  pix: Map<string, PixRec>;
  webhooks: Map<string, { webhookUrl: string; criacao: string }>;
  webhookRec?: string;
  webhookCobR?: string;
  recs: Map<string, RecRec>;
  solicrecs: Map<string, Obj>;
  cobrs: Map<string, Obj>;
  lotes: Map<string, Obj>;
  nextLoc: number;
  deliveries: Delivery[];
};

const iso = (t: number) => new Date(t).toISOString();
const day = (t: number) => iso(t).slice(0, 10);
const stamp = (t: number) => iso(t).replace(/[-T:]/g, "").slice(0, 12); // yyyyMMddHHmm
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const HEX = "0123456789abcdef";
const randStr = (r: Rng, n: number, abc = ALNUM) => Array.from({ length: n }, () => abc[Math.floor(r.next() * abc.length)]).join("");

export function newPsp(): Psp {
  const p: Psp = {
    t: T0,
    r: rng(2026),
    cobs: new Map(),
    locs: new Map(),
    pix: new Map(),
    webhooks: new Map(),
    recs: new Map(),
    solicrecs: new Map(),
    cobrs: new Map(),
    lotes: new Map(),
    nextLoc: 7716,
    deliveries: [],
  };
  // one static-QR Pix already received (txid repeated, shorter than 26 chars — legal for static QR)
  p.pix.set("E87654321202610021245a1b2c3d4e5f", {
    endToEndId: "E87654321202610021245a1b2c3d4e5f",
    txid: "LOJA01CAIXA2",
    valor: "15.90",
    horario: iso(T0 - 15 * 60_000),
    infoPagador: "cafe + pao de queijo",
    chave: OWNED_KEYS[0],
    devolucoes: [],
  });
  return p;
}

export const e2eId = (p: Psp, ispb = PAYER_ISPB) => `E${ispb}${stamp(p.t)}${randStr(p.r, 11)}`;

function problem(name: string, status: number, title: string, detail: string, violacoes?: Violation[]): Res {
  const body: Obj = { type: ERR + name, title, status, detail };
  if (violacoes?.length) body.violacoes = violacoes as unknown as Json;
  return { status, body, contentType: "application/problem+json" };
}
const opInvalida = (ent: "Cob" | "CobV" | "Rec" | "SolicRec" | "CobR" | "LoteCobV", v: Violation[]) =>
  problem(
    `${ent}OperacaoInvalida`,
    400,
    ent === "Cob" ? "Cobrança inválida." : ent === "CobV" ? "Cobrança inválida." : "Operação inválida.",
    {
      Cob: "A requisição que busca alterar ou criar uma cobrança para pagamento imediato não respeita o _schema_ ou está semanticamente errada.",
      CobV: "A requisição que busca alterar ou criar uma cobrança com vencimento não respeita o _schema_ ou está semanticamente errada.",
      Rec: "A requisição que busca alterar ou criar uma recorrência não respeita o _schema_ ou está semanticamente errada.",
      SolicRec: "A requisição que busca criar ou alterar uma solicitação de confirmação de recorrência não respeita o _schema_ ou está semanticamente errada.",
      CobR: "A requisição que busca alterar ou criar uma cobrança recorrente não respeita o _schema_ ou está semanticamente errada.",
      LoteCobV: "A requisição que busca alterar ou criar um lote de cobranças com vencimento não respeita o _schema_ ou está semanticamente errada.",
    }[ent],
    v,
  );
const notFound = (name: string, detail: string) => problem(name, 404, "Não Encontrado", detail);

const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: Json | undefined) => (typeof x === "string" ? x : x === undefined ? undefined : JSON.stringify(x));

/* ---------------------------------------------------------------- validation ---- */

function validateDevedor(pre: string, d: Json | undefined, v: Violation[], nomeRequired: boolean) {
  if (d === undefined) {
    if (nomeRequired) v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_.`, propriedade: `${pre}.devedor` });
    return;
  }
  if (!isObj(d)) return void v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_.`, propriedade: `${pre}.devedor` });
  const cpf = d.cpf, cnpj = d.cnpj, nome = d.nome;
  if (cpf !== undefined && cnpj !== undefined)
    v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_ (cpf e cnpj são mutuamente exclusivos).`, propriedade: `${pre}.devedor` });
  if (cpf !== undefined && !(typeof cpf === "string" && /^\d{11}$/.test(cpf)))
    v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_.`, propriedade: `${pre}.devedor.cpf`, valor: str(cpf) });
  if (cnpj !== undefined && !(typeof cnpj === "string" && /^[0-9A-Z]{14}$/.test(cnpj)))
    v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_.`, propriedade: `${pre}.devedor.cnpj`, valor: str(cnpj) });
  if ((cpf !== undefined || cnpj !== undefined || nomeRequired) && !(typeof nome === "string" && nome.length > 0 && nome.length <= 200))
    v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_ (nome é obrigatório quando cpf ou cnpj estiver preenchido).`, propriedade: `${pre}.devedor.nome` });
  if (nomeRequired && cpf === undefined && cnpj === undefined)
    v.push({ razao: `O objeto ${pre}.devedor não respeita o _schema_ (informe cpf ou cnpj).`, propriedade: `${pre}.devedor` });
}

function validateCommon(p: Psp, pre: "cob" | "cobv", b: Obj, v: Violation[], selfTxid: string | null) {
  const chave = b.chave;
  if (chave !== undefined || selfTxid === null) {
    if (!(typeof chave === "string" && chave.length > 0 && chave.length <= 77))
      v.push({ razao: `O campo ${pre}.chave não respeita o _schema_.`, propriedade: `${pre}.chave`, valor: str(chave) });
    else if (!OWNED_KEYS.includes(chave))
      v.push({ razao: `O campo ${pre}.chave corresponde a uma conta que não pertence a este usuário recebedor.`, propriedade: `${pre}.chave`, valor: chave });
  }
  const sp = b.solicitacaoPagador;
  if (sp !== undefined && !(typeof sp === "string" && sp.length <= 140))
    v.push({ razao: "O campo solicitacaoPagador não respeita o _schema_ (máx. 140 caracteres).", propriedade: `${pre}.solicitacaoPagador` });
  const ia = b.infoAdicionais;
  if (ia !== undefined) {
    const ok =
      Array.isArray(ia) &&
      ia.length <= 50 &&
      ia.every((x) => isObj(x) && typeof x.nome === "string" && x.nome.length <= 50 && typeof x.valor === "string" && x.valor.length <= 200);
    if (!ok) v.push({ razao: "O objeto infoAdicionais não respeita o _schema_ (até 50 itens; nome ≤ 50, valor ≤ 200).", propriedade: `${pre}.infoAdicionais` });
  }
  const loc = b.loc;
  if (loc !== undefined) {
    const id = isObj(loc) ? loc.id : undefined;
    const L = typeof id === "number" ? p.locs.get(id) : undefined;
    if (!L) v.push({ razao: `O location referenciado por ${pre}.loc.id inexiste.`, propriedade: `${pre}.loc.id`, valor: str(id) });
    else if (L.txid && L.txid !== selfTxid)
      v.push({ razao: `O location referenciado por ${pre}.loc.id já está sendo utilizado por outra cobrança.`, propriedade: `${pre}.loc.id`, valor: String(L.id) });
    else if (L.tipoCob !== pre)
      v.push({ razao: `O location referenciado por ${pre}.loc.id apresenta tipo "${L.tipoCob}" (deveria ser "${pre}").`, propriedade: `${pre}.loc.id`, valor: String(L.id) });
  }
}

function validateCob(p: Psp, b: Obj, selfTxid: string | null, patch: boolean): Violation[] {
  const v: Violation[] = [];
  const cal = b.calendario;
  if (cal !== undefined) {
    const e = isObj(cal) ? cal.expiracao : undefined;
    if (e !== undefined && !(typeof e === "number" && Number.isInteger(e) && e > 0))
      v.push({ razao: "O campo cob.calendario.expiracao é igual ou menor que zero.", propriedade: "cob.calendario.expiracao", valor: str(e) });
  }
  const val = b.valor;
  if (val !== undefined || !patch) {
    const o = isObj(val) ? val.original : undefined;
    const mod = isObj(val) ? val.modalidadeAlteracao : undefined;
    if (!(typeof o === "string" && MONEY.test(o)))
      v.push({ razao: "O campo cob.valor.original não respeita o _schema_.", propriedade: "cob.valor.original", valor: str(o) });
    else if (Number(o) === 0 && mod !== 1)
      v.push({ razao: "O campo cob.valor.original é zero.", propriedade: "cob.valor.original", valor: o });
    if (mod !== undefined && mod !== 0 && mod !== 1)
      v.push({ razao: "O campo cob.valor.modalidadeAlteracao não respeita o _schema_ (0 ou 1).", propriedade: "cob.valor.modalidadeAlteracao", valor: str(mod) });
  }
  validateDevedor("cob", b.devedor, v, false);
  validateCommon(p, "cob", b, v, selfTxid);
  return v;
}

function validateCobv(p: Psp, b: Obj, selfTxid: string | null): Violation[] {
  const v: Violation[] = [];
  const cal = isObj(b.calendario) ? b.calendario : undefined;
  const dv = cal?.dataDeVencimento;
  if (!(typeof dv === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dv)))
    v.push({ razao: "O objeto cobv.calendario não respeita o _schema_ (dataDeVencimento YYYY-MM-DD).", propriedade: "cobv.calendario.dataDeVencimento", valor: str(dv) });
  else if (dv < day(p.t))
    v.push({ razao: "O campo cobv.calendario.dataDeVencimento é anterior à data de criação da cobrança.", propriedade: "cobv.calendario.dataDeVencimento", valor: dv });
  const vav = cal?.validadeAposVencimento;
  if (vav !== undefined && !(typeof vav === "number" && vav >= 0))
    v.push({ razao: "O campo cobv.calendario.validadeAposVencimento é menor do que zero.", propriedade: "cobv.calendario.validadeAposVencimento", valor: str(vav) });
  const val = isObj(b.valor) ? b.valor : undefined;
  const o = val?.original;
  if (!(typeof o === "string" && MONEY.test(o))) v.push({ razao: "O campo cobv.valor.original não respeita o _schema_.", propriedade: "cobv.valor.original", valor: str(o) });
  else if (Number(o) === 0) v.push({ razao: "O campo cobv.valor.original apresenta o valor zero.", propriedade: "cobv.valor.original", valor: o });
  const orig = Number(o) || 0;
  for (const k of ["multa", "juros", "abatimento"] as const) {
    const x = val?.[k];
    if (x === undefined) continue;
    const mods = k === "juros" ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2];
    const m = isObj(x) ? Number(x.modalidade) : NaN;
    const vp = isObj(x) ? x.valorPerc : undefined;
    if (!mods.includes(m) || !(typeof vp === "string" && MONEY.test(vp)))
      v.push({ razao: `O objeto cobv.valor.${k} não respeita o _schema_.`, propriedade: `cobv.valor.${k}` });
    else if (k === "abatimento" && ((m === 1 && Number(vp) >= orig) || (m === 2 && Number(vp) >= 100)))
      v.push({ razao: "O objeto cobv.valor.abatimento representa um valor maior ou igual ao valor da cobrança original ou maior ou igual a 100%.", propriedade: "cobv.valor.abatimento" });
  }
  const d = val?.desconto;
  if (d !== undefined) {
    const m = isObj(d) ? Number(d.modalidade) : NaN;
    const arr = isObj(d) ? d.descontoDataFixa : undefined;
    const vp = isObj(d) ? d.valorPerc : undefined;
    if (![1, 2, 3, 4, 5, 6].includes(m)) v.push({ razao: "O objeto cobv.valor.desconto não respeita o _schema_.", propriedade: "cobv.valor.desconto" });
    else if (m <= 2) {
      if (vp !== undefined) v.push({ razao: "O objeto cobv.valor.desconto apresenta modalidade no valor 1 ou 2, porém cobv.valor.desconto.valorPerc encontra-se preenchido", propriedade: "cobv.valor.desconto.valorPerc" });
      if (!Array.isArray(arr) || arr.length === 0)
        v.push({ razao: "O objeto cobv.valor.desconto apresenta modalidade no valor 1 ou 2, porém o array cobv.valor.desconto.descontoDataFixa está vazio ou nulo.", propriedade: "cobv.valor.desconto.descontoDataFixa" });
      else
        arr.forEach((e, i) => {
          if (!isObj(e)) return;
          if (typeof dv === "string" && typeof e.data === "string" && e.data > dv)
            v.push({ razao: "O objeto cobv.valor.desconto apresenta algum elemento cuja data seja posterior à data de vencimento representada por calendario.dataDeVencimento.", propriedade: `cobv.valor.desconto.descontoDataFixa[${i}].data`, valor: e.data });
          const pv = Number(e.valorPerc);
          if ((m === 1 && pv >= orig) || (m === 2 && pv >= 100))
            v.push({ razao: "O objeto cobv.valor.desconto apresenta algum elemento de desconto que representa um valor maior ou igual ao valor da cobrança original ou maior ou igual a 100%.", propriedade: `cobv.valor.desconto.descontoDataFixa[${i}].valorPerc` });
        });
    } else {
      if (vp === undefined) v.push({ razao: "O objeto cobv.valor.desconto apresenta modalidade nos valores de 3 a 6, porém o elemento cobv.valor.desconto.valorPerc não está preenchido.", propriedade: "cobv.valor.desconto.valorPerc" });
      if (arr !== undefined) v.push({ razao: "O objeto cobv.valor.desconto apresenta modalidade nos valores de 3 a 6, porém o elemento cobv.valor.desconto.descontoDataFixa está preenchido ou não nulo.", propriedade: "cobv.valor.desconto.descontoDataFixa" });
    }
  }
  validateDevedor("cobv", b.devedor, v, true);
  validateCommon(p, "cobv", b, v, selfTxid);
  return v;
}

/* ---------------------------------------------------------------- entities ---- */

function newLoc(p: Psp, tipoCob: "cob" | "cobv"): LocRec {
  const id = p.nextLoc++;
  const L: LocRec = { id, tipoCob, criacao: iso(p.t), location: `pix.example.com/qr/v2/${tipoCob === "cobv" ? "cobv/" : ""}${randStr(p.r, 32, HEX)}` };
  p.locs.set(id, L);
  return L;
}
const locJson = (L: LocRec): Obj => ({ id: L.id, location: L.location, tipoCob: L.tipoCob, criacao: L.criacao });

function pixJson(px: PixRec): Obj {
  const o: Obj = { endToEndId: px.endToEndId };
  if (px.txid) o.txid = px.txid;
  o.valor = px.valor;
  o.chave = px.chave;
  o.horario = px.horario;
  if (px.infoPagador) o.infoPagador = px.infoPagador;
  if (px.devolucoes.length) o.devolucoes = px.devolucoes.map(devJson);
  return o;
}
function devJson(d: DevRec): Obj {
  const o: Obj = { id: d.id, rtrId: d.rtrId, valor: d.valor, natureza: d.natureza };
  if (d.descricao) o.descricao = d.descricao;
  const h: Obj = { solicitacao: d.solicitacao };
  if (d.liquidacao) h.liquidacao = d.liquidacao;
  o.horario = h;
  o.status = d.status;
  if (d.motivo) o.motivo = d.motivo;
  return o;
}

export function cobJson(p: Psp, c: CobRec): Obj {
  const L = p.locs.get(c.locId)!;
  const d = c.data;
  const cal: Obj =
    c.kind === "cob"
      ? { criacao: c.criacao, expiracao: (isObj(d.calendario) && typeof d.calendario.expiracao === "number" ? d.calendario.expiracao : 86400) as number }
      : {
          criacao: c.criacao,
          dataDeVencimento: (isObj(d.calendario) ? d.calendario.dataDeVencimento : "") as string,
          validadeAposVencimento: (isObj(d.calendario) && typeof d.calendario.validadeAposVencimento === "number" ? d.calendario.validadeAposVencimento : 30) as number,
        };
  const o: Obj = { calendario: cal, txid: c.txid, revisao: c.revisao, loc: { id: L.id, location: L.location, tipoCob: L.tipoCob }, location: L.location, status: c.status };
  if (d.devedor !== undefined) o.devedor = d.devedor;
  if (c.kind === "cobv")
    o.recebedor = { logradouro: "Rua 15 Numero 1200, Bairro São Luiz", cidade: "São Paulo", uf: "SP", cep: "01310100", cnpj: RECEBEDOR_CNPJ, nome: "Empresa de Serviços SA" };
  o.valor = d.valor ?? null;
  o.chave = d.chave ?? null;
  if (d.solicitacaoPagador !== undefined) o.solicitacaoPagador = d.solicitacaoPagador;
  if (d.infoAdicionais !== undefined) o.infoAdicionais = d.infoAdicionais;
  o.pixCopiaECola = dynamicBrCode(L.location);
  if (c.pix.length) o.pix = c.pix.map((e) => pixJson(p.pix.get(e)!));
  return o;
}

const CLIENT_FIELDS = ["calendario", "devedor", "valor", "chave", "solicitacaoPagador", "infoAdicionais"];

function createOrUpdateCob(p: Psp, kind: "cob" | "cobv", txid: string, b: Obj, method: "PUT" | "POST"): Res {
  const Ent = kind === "cob" ? "Cob" : "CobV";
  const v: Violation[] = [];
  if (!TXID.test(txid)) v.push({ razao: "O campo txid não respeita o _schema_ ([a-zA-Z0-9]{26,35}).", propriedade: `${kind}.txid`, valor: txid });
  const existing = p.cobs.get(txid);
  if (existing && existing.kind !== kind)
    v.push({ razao: `O txid já é utilizado por uma cobrança do tipo ${existing.kind} (txid é único por recebedor, entre cob e cobv).`, propriedade: `${kind}.txid`, valor: txid });
  if (existing && existing.kind === kind && existing.status !== "ATIVA")
    v.push({ razao: "A cobrança já existe, não está no status ATIVA, e a presente requisição busca alterá-la.", propriedade: `${kind}.status`, valor: existing.status });
  v.push(...(kind === "cob" ? validateCob(p, b, existing ? txid : null, false) : validateCobv(p, b, existing ? txid : null)));
  if (v.length) return opInvalida(Ent, v);

  const data: Obj = {};
  for (const k of CLIENT_FIELDS) if (b[k] !== undefined) data[k] = b[k];
  if (existing) {
    // PUT on an existing ATIVA charge: replace; revisao only increments if a non-loc field changed (idempotent replay = no-op)
    const changed = JSON.stringify(existing.data) !== JSON.stringify(data);
    if (changed) {
      existing.history.push(cobJson(p, existing));
      existing.data = data;
      existing.revisao++;
    }
    rebindLoc(p, existing, b);
    return { status: 201, body: cobJson(p, existing), note: changed ? `revisao → ${existing.revisao}` : "same txid + same body: idempotent replay, nothing changed" };
  }
  let L: LocRec;
  const lid = isObj(b.loc) ? b.loc.id : undefined;
  if (typeof lid === "number") L = p.locs.get(lid)!;
  else L = newLoc(p, kind);
  L.txid = txid;
  const c: CobRec = { kind, txid, revisao: 0, status: "ATIVA", data, criacao: iso(p.t), locId: L.id, history: [], pix: [] };
  p.cobs.set(txid, c);
  return { status: 201, body: cobJson(p, c), note: method === "POST" ? "txid generated by the PSP — your system only learns it from this response" : undefined };
}

function rebindLoc(p: Psp, c: CobRec, b: Obj) {
  const lid = isObj(b.loc) ? b.loc.id : undefined;
  if (typeof lid === "number" && lid !== c.locId) {
    const old = p.locs.get(c.locId);
    if (old) delete old.txid;
    const L = p.locs.get(lid)!;
    L.txid = c.txid;
    c.locId = lid;
  }
}

function patchCob(p: Psp, kind: "cob" | "cobv", txid: string, b: Obj): Res {
  const Ent = kind === "cob" ? "Cob" : "CobV";
  const c = p.cobs.get(txid);
  if (!c || c.kind !== kind) return notFound(kind === "cob" ? "CobNaoEncontrado" : "CobVNaoEncontrada", "Cobrança não encontrada para o txid informado.");
  const v: Violation[] = [];
  if (c.status !== "ATIVA") v.push({ razao: "A cobrança não está ATIVA, e a presente requisição busca alterá-la.", propriedade: `${kind}.status`, valor: c.status });
  const st = b.status;
  const others = Object.keys(b).filter((k) => k !== "status" && k !== "loc");
  if (st !== undefined) {
    if (st !== "REMOVIDA_PELO_USUARIO_RECEBEDOR") v.push({ razao: "O campo cob.status não respeita o _schema_.", propriedade: `${kind}.status`, valor: str(st) });
    else if (others.length)
      v.push({ razao: "A cobrança está ATIVA, e a presente requisição propõe alterar seu status para REMOVIDA_PELO_USUARIO_RECEBEDOR juntamente com outras alterações.", propriedade: `${kind}.status` });
  }
  if (!v.length) v.push(...(kind === "cob" ? validateCob(p, b, txid, true) : []));
  if (v.length) return opInvalida(Ent, v);
  if (st === "REMOVIDA_PELO_USUARIO_RECEBEDOR") {
    c.history.push(cobJson(p, c));
    c.status = "REMOVIDA_PELO_USUARIO_RECEBEDOR";
    c.revisao++;
    return { status: 200, body: cobJson(p, c), note: "status is final: the location may now answer 404/410 to payer PSPs" };
  }
  const merged: Obj = { ...c.data };
  for (const k of CLIENT_FIELDS) {
    const nv = b[k];
    if (nv === undefined) continue;
    merged[k] = isObj(nv) && isObj(merged[k]) ? { ...(merged[k] as Obj), ...nv } : nv;
  }
  const changed = JSON.stringify(merged) !== JSON.stringify(c.data);
  if (changed) {
    c.history.push(cobJson(p, c));
    c.data = merged;
    c.revisao++;
  }
  rebindLoc(p, c, b);
  return { status: 200, body: cobJson(p, c), note: changed ? `revisao → ${c.revisao}` : "only loc (or nothing) changed: revisao is not incremented" };
}

/* ---------------------------------------------------------------- payments ---- */

export function payCob(p: Psp, txid: string): PixRec | null {
  const c = p.cobs.get(txid);
  if (!c || c.status !== "ATIVA") return null;
  const val = isObj(c.data.valor) ? c.data.valor : {};
  let valor = typeof val.original === "string" ? val.original : "1.00";
  if (Number(valor) === 0) valor = "25.00"; // modalidadeAlteracao = 1 with suggested 0.00: the payer typed a value
  const px: PixRec = { endToEndId: e2eId(p), txid, valor, horario: iso(p.t), infoPagador: "pedido 4471", chave: (c.data.chave as string) ?? OWNED_KEYS[0], devolucoes: [] };
  p.pix.set(px.endToEndId, px);
  c.pix.push(px.endToEndId);
  c.status = "CONCLUIDA";
  p.t += 1200;
  notifyPix(p, px);
  return px;
}

function notifyPix(p: Psp, px: PixRec) {
  const wh = p.webhooks.get(px.chave);
  if (!wh || !px.txid) return;
  p.deliveries.unshift({ at: iso(p.t), url: wh.webhookUrl.replace(/\/$/, "") + "/pix", body: { pix: [pixJson(px)] } });
  p.deliveries = p.deliveries.slice(0, 6);
}

function settleDevolucoes(p: Psp) {
  for (const px of p.pix.values())
    for (const d of px.devolucoes)
      if (d.status === "EM_PROCESSAMENTO" && p.t >= d.settleAt) {
        d.status = "DEVOLVIDO";
        d.liquidacao = iso(d.settleAt);
        notifyPix(p, px);
      }
}

/* ---------------------------------------------------------------- router ---- */

export type Endpoint = {
  id: string;
  method: "GET" | "PUT" | "POST" | "PATCH";
  path: string; // template
  scope: string;
  tag: string;
  summary: string;
  body?: (p: Psp) => Obj;
  presets?: { label: string; body: (p: Psp) => Obj }[];
};

const futureDay = (p: Psp, d: number) => day(p.t + d * 86400_000);

export const ENDPOINTS: Endpoint[] = [
  {
    id: "put-cob",
    method: "PUT",
    path: "/cob/{txid}",
    scope: "cob.write",
    tag: "Cob",
    summary: "Create an immediate charge with your own txid",
    body: () => ({
      calendario: { expiracao: 3600 },
      devedor: { cnpj: "12345678000195", nome: "Empresa de Serviços SA" },
      valor: { original: "37.00", modalidadeAlteracao: 0 },
      chave: OWNED_KEYS[0],
      solicitacaoPagador: "Serviço realizado.",
      infoAdicionais: [{ nome: "Pedido", valor: "4471" }],
    }),
    presets: [
      { label: "valor 0.00", body: () => ({ calendario: { expiracao: 3600 }, valor: { original: "0.00" }, chave: OWNED_KEYS[0] }) },
      { label: "chave not yours", body: () => ({ valor: { original: "10.00" }, chave: "+5511999990000" }) },
      { label: "cpf w/o nome", body: () => ({ devedor: { cpf: "12345678909" }, valor: { original: "10.00" }, chave: OWNED_KEYS[0] }) },
      { label: "expiracao 0", body: () => ({ calendario: { expiracao: 0 }, valor: { original: "10" }, chave: OWNED_KEYS[0] }) },
    ],
  },
  { id: "post-cob", method: "POST", path: "/cob", scope: "cob.write", tag: "Cob", summary: "Create an immediate charge, txid generated by the PSP", body: () => ({ calendario: { expiracao: 900 }, valor: { original: "12.50" }, chave: OWNED_KEYS[1] }) },
  { id: "get-cob", method: "GET", path: "/cob/{txid}", scope: "cob.read", tag: "Cob", summary: "Read a charge (and the Pix that paid it)" },
  {
    id: "patch-cob",
    method: "PATCH",
    path: "/cob/{txid}",
    scope: "cob.write",
    tag: "Cob",
    summary: "Revise or remove a charge",
    body: () => ({ valor: { original: "42.00" } }),
    presets: [
      { label: "remove", body: () => ({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }) },
      { label: "remove + change", body: () => ({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR", valor: { original: "1.00" } }) },
    ],
  },
  {
    id: "put-cobv",
    method: "PUT",
    path: "/cobv/{txid}",
    scope: "cobv.write",
    tag: "CobV",
    summary: "Create a charge with a due date",
    body: (p) => ({
      calendario: { dataDeVencimento: futureDay(p, 30), validadeAposVencimento: 30 },
      devedor: { cpf: "12345678909", nome: "Francisco da Silva", logradouro: "Alameda Souza, Numero 80", cidade: "Recife", uf: "PE", cep: "50000000" },
      valor: {
        original: "123.45",
        multa: { modalidade: 2, valorPerc: "2.00" },
        juros: { modalidade: 3, valorPerc: "1.00" },
        desconto: { modalidade: 1, descontoDataFixa: [{ data: futureDay(p, 20), valorPerc: "10.00" }] },
      },
      chave: OWNED_KEYS[0],
      solicitacaoPagador: "Mensalidade outubro.",
    }),
    presets: [
      { label: "due date in past", body: () => ({ calendario: { dataDeVencimento: "2026-01-10" }, devedor: { cpf: "12345678909", nome: "Francisco" }, valor: { original: "50.00" }, chave: OWNED_KEYS[0] }) },
      { label: "desconto after due", body: (p) => ({ calendario: { dataDeVencimento: futureDay(p, 10) }, devedor: { cpf: "12345678909", nome: "Francisco" }, valor: { original: "50.00", desconto: { modalidade: 1, descontoDataFixa: [{ data: futureDay(p, 15), valorPerc: "5.00" }] } }, chave: OWNED_KEYS[0] }) },
      { label: "no devedor", body: (p) => ({ calendario: { dataDeVencimento: futureDay(p, 10) }, valor: { original: "50.00" }, chave: OWNED_KEYS[0] }) },
    ],
  },
  { id: "get-cobv", method: "GET", path: "/cobv/{txid}", scope: "cobv.read", tag: "CobV", summary: "Read a charge with due date" },
  {
    id: "put-lote",
    method: "PUT",
    path: "/lotecobv/{id}",
    scope: "lotecobv.write",
    tag: "LoteCobV",
    summary: "Create a batch of cobv (202: processed asynchronously)",
    body: (p) => ({
      descricao: "Cobranças dos alunos do turno vespertino",
      cobsv: [
        { txid: "fb2761260e554ad593c7226beb5cb650", calendario: { dataDeVencimento: futureDay(p, 15) }, devedor: { cpf: "08577095428", nome: "João Souza" }, valor: { original: "100.25" }, chave: OWNED_KEYS[0] },
        { txid: "7978c0c97ea847e78e8849634473c1f1", calendario: { dataDeVencimento: futureDay(p, 15) }, devedor: { cpf: "15311295449" }, valor: { original: "100.25" }, chave: OWNED_KEYS[0] },
      ] as Obj[],
    }),
  },
  { id: "get-lote", method: "GET", path: "/lotecobv/{id}", scope: "lotecobv.read", tag: "LoteCobV", summary: "Read batch status (CRIADA / NEGADA + problema)" },
  { id: "post-loc", method: "POST", path: "/loc", scope: "payloadlocation.write", tag: "PayloadLocation", summary: "Reserve a location (e.g. for a printed dynamic QR)", body: () => ({ tipoCob: "cob" }) },
  { id: "get-loc", method: "GET", path: "/loc/{id}", scope: "payloadlocation.read", tag: "PayloadLocation", summary: "Read a location and the txid bound to it" },
  { id: "get-pix-list", method: "GET", path: "/pix?inicio=2026-10-02T00:00:00Z&fim=2026-10-02T23:59:59Z", scope: "pix.read", tag: "Pix", summary: "List received Pix in a time window" },
  { id: "get-pix", method: "GET", path: "/pix/{e2eid}", scope: "pix.read", tag: "Pix", summary: "Read one received Pix" },
  {
    id: "put-dev",
    method: "PUT",
    path: "/pix/{e2eid}/devolucao/{id}",
    scope: "pix.write",
    tag: "Pix",
    summary: "Request a devolução (refund) of a received Pix",
    body: () => ({ valor: "7.89", natureza: "ORIGINAL", descricao: "Devolução do item 2 do pedido" }),
    presets: [{ label: "more than paid", body: () => ({ valor: "9999.00" }) }],
  },
  { id: "get-dev", method: "GET", path: "/pix/{e2eid}/devolucao/{id}", scope: "pix.read", tag: "Pix", summary: "Poll a devolução until DEVOLVIDO / NAO_REALIZADO" },
  {
    id: "put-webhook",
    method: "PUT",
    path: "/webhook/{chave}",
    scope: "webhook.write",
    tag: "Webhook",
    summary: "Register a webhook for a Pix key (PSP will POST to {webhookUrl}/pix)",
    body: () => ({ webhookUrl: "https://erp.example.com/api/webhook" }),
    presets: [{ label: "http:// url", body: () => ({ webhookUrl: "http://erp.example.com/hook" }) }],
  },
  {
    id: "post-rec",
    method: "POST",
    path: "/rec",
    scope: "rec.write",
    tag: "Rec",
    summary: "Pix Automático: create a recurrence",
    body: (p) => ({
      vinculo: { contrato: "63100862", devedor: { cpf: "45164632481", nome: "Fulano de Tal" }, objeto: "Serviço de Streaming de Música." },
      calendario: { dataInicial: futureDay(p, 10), dataFinal: futureDay(p, 375), periodicidade: "MENSAL" },
      valor: { valorRec: "35.00" },
      politicaRetentativa: "PERMITE_3R_7D",
    }),
    presets: [{ label: "valorRec + valorMinimo", body: (p) => ({ vinculo: { contrato: "1", devedor: { cpf: "45164632481", nome: "Fulano" } }, calendario: { dataInicial: futureDay(p, 5), periodicidade: "MENSAL" }, valor: { valorRec: "35.00", valorMinimoRecebedor: "10.00" }, politicaRetentativa: "NAO_PERMITE" }) }],
  },
  {
    id: "post-solicrec",
    method: "POST",
    path: "/solicrec",
    scope: "solicrec.write",
    tag: "SolicRec",
    summary: "Pix Automático Jornada 1: ask the payer to confirm a recurrence",
    body: (p) => ({
      idRec: [...p.recs.keys()][0] ?? "RR12345678202610021234567890",
      calendario: { dataExpiracaoSolicitacao: iso(p.t + 5 * 86400_000) },
      destinatario: { agencia: "2569", conta: "550689", cpf: "45164632481", ispbParticipante: "91193552" },
    }),
  },
  {
    id: "put-cobr",
    method: "PUT",
    path: "/cobr/{txid}",
    scope: "cobr.write",
    tag: "CobR",
    summary: "Pix Automático: create one recurring charge of a recurrence",
    body: (p) => ({
      idRec: [...p.recs.keys()][0] ?? "RR12345678202610021234567890",
      infoAdicional: "Mensalidade streaming.",
      calendario: { dataDeVencimento: futureDay(p, 13) },
      valor: { original: "35.00" },
      ajusteDiaUtil: true,
      recebedor: { agencia: "9708", conta: "012682", tipoConta: "CORRENTE" },
    }),
  },
  { id: "put-webhookrec", method: "PUT", path: "/webhookrec", scope: "webhookrec.write", tag: "WebhookRec", summary: "Webhook for recurrence updates (POST to {url}/rec)", body: () => ({ webhookUrl: "https://erp.example.com/api/webhook" }) },
  { id: "put-webhookcobr", method: "PUT", path: "/webhookcobr", scope: "webhookcobr.write", tag: "WebhookCobR", summary: "Webhook for recurring-charge updates (POST to {url}/cobr)", body: () => ({ webhookUrl: "https://erp.example.com/api/webhook" }) },
];

export function genTxid(p: Psp) {
  return randStr(p.r, 32, HEX);
}

function parseQuery(q: string) {
  const out: Record<string, string> = {};
  for (const kv of q.split("&")) {
    if (!kv) continue;
    const [k, v = ""] = kv.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

const webhookUrlOk = (u: Json | undefined) => typeof u === "string" && /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i.test(u);

/** Route one request. Mutates the PSP. */
export function handle(p: Psp, method: string, rawPath: string, body: Json | undefined): Res {
  p.t += 1200;
  settleDevolucoes(p);
  const [path, qs = ""] = rawPath.trim().split("?");
  const seg = path.split("/").filter(Boolean);
  const b: Obj = isObj(body) ? body : {};
  const m = method.toUpperCase();

  if (seg[0] === "cob" || seg[0] === "cobv") {
    const kind = seg[0] as "cob" | "cobv";
    if (seg.length === 1 && m === "POST" && kind === "cob") return createOrUpdateCob(p, "cob", genTxid(p), b, "POST");
    const txid = seg[1];
    if (!txid) return problem("RequisicaoInvalida", 400, "Requisição inválida.", "Informe o txid no path.");
    if (m === "PUT") return createOrUpdateCob(p, kind, txid, b, "PUT");
    if (m === "PATCH") return patchCob(p, kind, txid, b);
    if (m === "GET") {
      const c = p.cobs.get(txid);
      if (!c || c.kind !== kind) return notFound(kind === "cob" ? "CobNaoEncontrado" : "CobVNaoEncontrada", "Cobrança não encontrada para o txid informado.");
      const rev = parseQuery(qs).revisao;
      if (rev !== undefined) {
        const n = Number(rev);
        if (n === c.revisao) return { status: 200, body: cobJson(p, c) };
        const h = c.history.find((x) => x.revisao === n);
        if (!h)
          return problem(kind === "cob" ? "CobConsultaInvalida" : "CobVConsultaInvalida", 400, "Consulta inválida.", "Parâmetros de consulta inválidos.", [
            { razao: "o parâmetro revisao corresponde a uma revisão inexistente para a cobrança apontada pelo parâmetro txid.", propriedade: "revisao", valor: rev },
          ]);
        return { status: 200, body: h };
      }
      return { status: 200, body: cobJson(p, c) };
    }
  }

  if (seg[0] === "lotecobv" && seg[1]) {
    const id = seg[1];
    if (m === "PUT") {
      const arr = b.cobsv;
      if (!Array.isArray(arr) || !arr.length) return opInvalida("LoteCobV", [{ razao: "O objeto loteCobV.cobsV não respeita o _schema_.", propriedade: "loteCobV.cobsV" }]);
      if (p.lotes.has(id)) return opInvalida("LoteCobV", [{ razao: "a presente requisição busca alterar um lote já existente (use PATCH para cobranças específicas).", propriedade: "loteCobV.cobsV" }]);
      const items: Json[] = arr.map((x) => {
        const o = isObj(x) ? x : {};
        const txid = typeof o.txid === "string" ? o.txid : "";
        const r = createOrUpdateCob(p, "cobv", txid, o, "PUT");
        if (r.status === 201) return { txid, status: "CRIADA", criacao: iso(p.t) } as Obj;
        return { txid, status: "NEGADA", problema: r.body ?? null } as Obj;
      });
      p.lotes.set(id, { descricao: (b.descricao as string) ?? "", criacao: iso(p.t), cobsv: items });
      return { status: 202, note: "Lote recebido para processamento. Poll GET /lotecobv/{id}: each item is CRIADA or NEGADA (+ problema)." };
    }
    if (m === "GET") {
      const l = p.lotes.get(id);
      return l ? { status: 200, body: l } : notFound("LoteCobVNaoEncontrado", "Lote não encontrado para o id informado.");
    }
  }

  if (seg[0] === "loc") {
    if (m === "POST" && seg.length === 1) {
      if (b.tipoCob !== "cob" && b.tipoCob !== "cobv")
        return problem("PayloadLocationOperacaoInvalida", 400, "Location inválida.", "A presente requisição busca criar uma location sem respeitar o schema estabelecido.", [
          { razao: "o campo tipoCob não respeita o _schema_.", propriedade: "tipoCob", valor: str(b.tipoCob) },
        ]);
      return { status: 201, body: locJson(newLoc(p, b.tipoCob)) };
    }
    if (m === "GET" && seg[1]) {
      if (seg[2] === "qrcode")
        return { status: 404, body: { detail: "GET /loc/{id}/qrcode is not part of the BCB API Pix. Some PSPs add it as an extension; the spec says the API does not return a QR image." }, note: "not in the spec" };
      const L = p.locs.get(Number(seg[1]));
      if (!L) return notFound("PayloadLocationNaoEncontrado", "Location não encontrada para o id informado.");
      const o = locJson(L);
      if (L.txid) o.txid = L.txid;
      return { status: 200, body: o };
    }
  }

  if (seg[0] === "pix") {
    if (seg.length === 1 && m === "GET") {
      const q = parseQuery(qs);
      const v: Violation[] = [];
      const ini = Date.parse(q.inicio ?? ""), fim = Date.parse(q.fim ?? "");
      if (Number.isNaN(ini) || Number.isNaN(fim)) v.push({ razao: "algum dos parâmetros informados para a consulta não respeita o _schema_ (inicio e fim são obrigatórios, RFC 3339).", propriedade: "inicio/fim" });
      else if (fim < ini) v.push({ razao: "o timestamp representado pelo parâmetro fim é anterior ao timestamp representado pelo parâmetro inicio.", propriedade: "fim", valor: q.fim });
      if (q.cpf && q.cnpj) v.push({ razao: "ambos os parâmetros cpf e cnpj estão preenchidos.", propriedade: "cpf/cnpj" });
      if (v.length) return problem("PixConsultaInvalida", 400, "Consulta inválida.", "Os parâmetros de consulta à lista de pix recebidos não respeitam o schema ou não fazem sentido semanticamente.", v);
      const list = [...p.pix.values()].filter((x) => {
        const t = Date.parse(x.horario);
        return t >= ini && t <= fim && (!q.txid || x.txid === q.txid) && (q.txIdPresente === undefined || (q.txIdPresente === "true") === !!x.txid);
      });
      return {
        status: 200,
        body: {
          parametros: { inicio: q.inicio, fim: q.fim, paginacao: { paginaAtual: 0, itensPorPagina: 100, quantidadeDePaginas: 1, quantidadeTotalDeItens: list.length } },
          pix: list.map(pixJson),
        },
      };
    }
    const px = seg[1] ? p.pix.get(seg[1]) : undefined;
    if (seg.length === 2 && m === "GET") return px ? { status: 200, body: pixJson(px) } : notFound("PixNaoEncontrado", "Pix não encontrado para o e2eid informado.");
    if (seg[2] === "devolucao" && seg[3]) {
      if (!px) return notFound("PixNaoEncontrado", "Pix não encontrado para o e2eid informado.");
      const id = seg[3];
      if (m === "GET") {
        const d = px.devolucoes.find((x) => x.id === id);
        return d ? { status: 200, body: devJson(d) } : notFound("PixDevolucaoNaoEncontrada", "Devolução não encontrada para o e2eid informado.");
      }
      if (m === "PUT") {
        const v: Violation[] = [];
        const valor = b.valor;
        if (!/^[a-zA-Z0-9]{1,35}$/.test(id)) v.push({ razao: "O id da devolução não respeita o _schema_ ([a-zA-Z0-9]{1,35}).", propriedade: "id", valor: id });
        if (!(typeof valor === "string" && MONEY.test(valor) && Number(valor) > 0)) v.push({ razao: "O campo devolucao.valor não respeita o _schema_.", propriedade: "devolucao.valor", valor: str(valor) });
        else {
          const used = px.devolucoes.filter((d) => d.status !== "NAO_REALIZADO").reduce((a, d) => a + Number(d.valor), 0);
          if (used + Number(valor) > Number(px.valor) + 1e-9)
            v.push({ razao: "A presente requisição de devolução, em conjunto com as demais prévias devoluções, excederia o valor do pix originário.", propriedade: "devolucao.valor", valor });
        }
        if (px.devolucoes.some((d) => d.id === id)) v.push({ razao: "A presente requisição de devolução apresenta um {id} já utilizado por outra requisição de devolução para o {e2eid} em questão.", propriedade: "id", valor: id });
        if (p.t - Date.parse(px.horario) > 90 * 86400_000) v.push({ razao: "A presente requisição de devolução viola a janela de tempo permitida (90 dias desde a liquidação do pix original).", propriedade: "e2eid" });
        if (b.natureza !== undefined && b.natureza !== "ORIGINAL" && b.natureza !== "RETIRADA") v.push({ razao: "O campo natureza não respeita o _schema_ (ORIGINAL | RETIRADA).", propriedade: "devolucao.natureza", valor: str(b.natureza) });
        if (v.length) return problem("PixDevolucaoInvalida", 400, "Devolução inválida.", "A presente requisição de devolução não respeita o schema ou não faz sentido semanticamente.", v);
        const d: DevRec = {
          id,
          rtrId: `D${ISPB}${stamp(p.t)}${randStr(p.r, 11)}`,
          valor: valor as string,
          natureza: (b.natureza as string) ?? "ORIGINAL",
          descricao: typeof b.descricao === "string" ? b.descricao.slice(0, 140) : undefined,
          solicitacao: iso(p.t),
          status: "EM_PROCESSAMENTO",
          settleAt: p.t + 1000,
        };
        px.devolucoes.push(d);
        return { status: 201, body: devJson(d), note: "a pacs.004 is now on its way through the SPI; GET it again to see the final status" };
      }
    }
  }

  if (seg[0] === "webhook" && seg[1] && m === "PUT") {
    const chave = decodeURIComponent(seg[1]);
    const v: Violation[] = [];
    if (!OWNED_KEYS.includes(chave)) v.push({ razao: "o parâmetro {chave} não corresponde a uma chave DICT pertencente a este usuário recebedor.", propriedade: "chave", valor: chave });
    if (!webhookUrlOk(b.webhookUrl)) v.push({ razao: "Campo webhook.webhookUrl não respeita o _schema_.", propriedade: "webhookUrl", valor: str(b.webhookUrl) });
    if (v.length) return problem("WebhookOperacaoInvalida", 400, "Webhook inválido.", "A presente requisição busca criar um webhook sem respeitar o schema ou, ainda, apresenta semântica inválida.", v);
    p.webhooks.set(chave, { webhookUrl: b.webhookUrl as string, criacao: iso(p.t) });
    return { status: 200, note: `callbacks for Pix to this key (with txid) will be POSTed to ${(b.webhookUrl as string).replace(/\/$/, "")}/pix` };
  }
  if ((seg[0] === "webhookrec" || seg[0] === "webhookcobr") && m === "PUT") {
    const Ent = seg[0] === "webhookrec" ? "WebhookRec" : "WebhookCobR";
    if (!webhookUrlOk(b.webhookUrl))
      return problem(`${Ent}OperacaoInvalida`, 400, "Webhook inválido.", "A presente requisição busca criar um webhook sem respeitar o schema.", [{ razao: "o campo webhookUrl não respeita o _schema_.", propriedade: "webhookUrl", valor: str(b.webhookUrl) }]);
    if (seg[0] === "webhookrec") p.webhookRec = b.webhookUrl as string;
    else p.webhookCobR = b.webhookUrl as string;
    return { status: 200, note: `updates will be POSTed to ${(b.webhookUrl as string).replace(/\/$/, "")}/${seg[0] === "webhookrec" ? "rec" : "cobr"}` };
  }

  if (seg[0] === "rec" && seg.length === 1 && m === "POST") {
    const v: Violation[] = [];
    const vin = b.vinculo;
    if (!isObj(vin) || typeof vin.contrato !== "string" || !isObj(vin.devedor) || typeof vin.devedor.nome !== "string")
      v.push({ razao: "O objeto rec.vinculo não respeita o _schema_.", propriedade: "rec.vinculo" });
    const cal = isObj(b.calendario) ? b.calendario : {};
    const di = cal.dataInicial, df = cal.dataFinal;
    if (typeof di !== "string" || di < day(p.t)) v.push({ razao: "O campo rec.calendario.dataInicial é anterior à data de criação da recorrência.", propriedade: "rec.calendario.dataInicial", valor: str(di) });
    if (typeof df === "string" && typeof di === "string" && df < di) v.push({ razao: "O campo rec.calendario.dataFinal é anterior ao campo rec.calendario.dataInicial.", propriedade: "rec.calendario.dataFinal", valor: df });
    if (!["SEMANAL", "MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"].includes(cal.periodicidade as string))
      v.push({ razao: "O campo rec.calendario.periodicidade não respeita o _schema_.", propriedade: "rec.calendario.periodicidade", valor: str(cal.periodicidade) });
    const val = isObj(b.valor) ? b.valor : {};
    if (val.valorRec !== undefined && val.valorMinimoRecebedor !== undefined)
      v.push({ razao: "Ambos os campos rec.valor.valorRec e rec.valor.valorMinimoRecebedor estão preenchidos.", propriedade: "rec.valor" });
    if (!["NAO_PERMITE", "PERMITE_3R_7D"].includes(b.politicaRetentativa as string))
      v.push({ razao: "O campo rec.politicaRetentativa não respeita o _schema_.", propriedade: "rec.politicaRetentativa", valor: str(b.politicaRetentativa) });
    if (v.length) return opInvalida("Rec", v);
    const idRec = `RR${ISPB}${day(p.t).replace(/-/g, "")}${randStr(p.r, 11)}`;
    const L = newLoc(p, "cob");
    L.location = L.location.replace("/qr/v2/", "/qr/v2/rec/");
    const rec: RecRec = { idRec, data: b, status: "CRIADA", criacao: iso(p.t) };
    p.recs.set(idRec, rec);
    return {
      status: 201,
      body: {
        idRec,
        ...b,
        recebedor: { cnpj: RECEBEDOR_CNPJ, nome: "Empresa de Serviços SA" },
        status: "CRIADA",
        ativacao: { tipoJornada: "AGUARDANDO_DEFINICAO" },
        atualizacao: [{ status: "CRIADA", data: iso(p.t) }],
      },
      note: "idRec = 'RR' + ISPB + yyyyMMdd + 11 alphanumerics (29 chars)",
    };
  }

  if (seg[0] === "solicrec" && seg.length === 1 && m === "POST") {
    const idRec = b.idRec as string;
    const rec = p.recs.get(idRec);
    if (!rec) return notFound("RecNaoEncontrada", "Recorrência não encontrada para o idRec informado.");
    const v: Violation[] = [];
    if ([...p.solicrecs.values()].some((s) => s.idRec === idRec && ["CRIADA", "ENVIADA", "RECEBIDA"].includes(s.status as string)))
      v.push({ razao: "Existe uma solicitação ativa referente ao mesmo solicrec.idRec.", propriedade: "solicrec.idRec", valor: idRec });
    if (rec.status !== "CRIADA") v.push({ razao: "Não é possível criar uma solicitação para uma recorrência que já foi confirmada ou está pendente de confirmação pelo usuário pagador.", propriedade: "solicrec.idRec" });
    const de = isObj(b.calendario) ? b.calendario.dataExpiracaoSolicitacao : undefined;
    if (typeof de !== "string" || Date.parse(de) < p.t) v.push({ razao: "O campo solicrec.calendario.dataExpiracaoSolicitacao é anterior à data de criação da solicitação da recorrência.", propriedade: "solicrec.calendario.dataExpiracaoSolicitacao", valor: str(de) });
    if (!isObj(b.destinatario)) v.push({ razao: "O objeto solicrec.destinatario não respeita o _schema_.", propriedade: "solicrec.destinatario" });
    if (v.length) return opInvalida("SolicRec", v);
    const id = `SC${ISPB}${day(p.t).replace(/-/g, "")}${randStr(p.r, 11)}`;
    const s: Obj = { idSolicRec: id, idRec, calendario: b.calendario ?? null, status: "CRIADA", destinatario: b.destinatario ?? null, atualizacao: [{ status: "CRIADA", data: iso(p.t) }] };
    p.solicrecs.set(id, s);
    return { status: 201, body: s, note: "PSP recebedor will send it to the payer's PSP (pain.009); status → ENVIADA → RECEBIDA → ACEITA/REJEITADA" };
  }

  if (seg[0] === "cobr" && seg[1] && m === "PUT") {
    const txid = seg[1];
    const v: Violation[] = [];
    if (!TXID.test(txid)) v.push({ razao: "O campo txid não respeita o _schema_.", propriedade: "cobr.txid", valor: txid });
    if (p.cobrs.has(txid) || p.cobs.has(txid)) v.push({ razao: "O campo cobr.txid encontra-se em uso.", propriedade: "cobr.txid", valor: txid });
    const rec = p.recs.get(b.idRec as string);
    const dv = isObj(b.calendario) ? b.calendario.dataDeVencimento : undefined;
    if (typeof dv !== "string" || dv < day(p.t)) v.push({ razao: "O campo cobr.calendario.dataDeVencimento é anterior à data de criação da cobrança.", propriedade: "cobr.calendario.dataDeVencimento", valor: str(dv) });
    const o = isObj(b.valor) ? b.valor.original : undefined;
    if (!(typeof o === "string" && MONEY.test(o))) v.push({ razao: "O campo cobr.valor não respeita o _schema_.", propriedade: "cobr.valor.original", valor: str(o) });
    if (typeof dv === "string")
      for (const c of p.cobrs.values())
        if (c.idRec === b.idRec && !["REJEITADA", "CANCELADA"].includes(c.status as string) && String(isObj(c.calendario) ? c.calendario.dataDeVencimento : "").slice(0, 7) === dv.slice(0, 7))
          v.push({ razao: "Existe uma CobR com status diferente de REJEITADA e CANCELADA referente ao mesmo cobr.idRec com calendario.dataDeVencimento no mesmo ciclo.", propriedade: "cobr.idRec" });
    if (!rec) return notFound("RecNaoEncontrada", "Recorrência não encontrada para o idRec informado (crie com POST /rec primeiro).");
    if (v.length) return opInvalida("CobR", v);
    const c: Obj = {
      idRec: b.idRec ?? null,
      txid,
      infoAdicional: b.infoAdicional ?? null,
      calendario: { criacao: day(p.t), dataDeVencimento: dv as string },
      status: "CRIADA",
      valor: b.valor ?? null,
      politicaRetentativa: (rec.data.politicaRetentativa as string) ?? "NAO_PERMITE",
      ajusteDiaUtil: b.ajusteDiaUtil ?? true,
      recebedor: b.recebedor ?? null,
      atualizacao: [{ status: "CRIADA", data: iso(p.t) }],
    };
    p.cobrs.set(txid, c);
    return { status: 201, body: c, note: rec.status !== "APROVADA" ? "note: in a real PSP the recurrence must be APROVADA before the charge is sent (pain.013) to the payer's PSP" : undefined };
  }

  return problem("NaoEncontrado", 404, "Não Encontrado", `Nenhum endpoint simulado para ${m} ${path}.`);
}

export const scopeFor = (method: string, path: string): string => {
  const seg = path.split("?")[0].split("/").filter(Boolean);
  const base = seg[0] ?? "";
  const read = method.toUpperCase() === "GET";
  const map: Record<string, string> = { cob: "cob", cobv: "cobv", lotecobv: "lotecobv", loc: "payloadlocation", pix: "pix", webhook: "webhook", webhookrec: "webhookrec", webhookcobr: "webhookcobr", rec: "rec", solicrec: "solicrec", cobr: "cobr" };
  return `${map[base] ?? base}.${read ? "read" : "write"}`;
};
