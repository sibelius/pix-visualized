// Catalogue of Pix QR flavours (Manual de Padrões v2.10.0 §2.4–2.8, §3.3; API Pix v2.10.0 schemas).
import type { BuildInput } from "./brcode";

export type Fetch = { label: string; request: string; json: unknown };

export type QrKind = {
  id: string;
  group: "static" | "dynamic" | "composite";
  label: string;
  product: string;
  input: BuildInput;
  fetches: Fetch[];
  notes: string[];
};

const base: BuildInput = {
  kind: "static",
  key: "",
  infoAdicional: "",
  fss: "",
  url: "",
  recUrl: "",
  amount: "",
  name: "FULANO DE TAL",
  city: "BRASILIA",
  cep: "",
  txid: "",
  unique: false,
};

const KEY = "123e4567-e12b-12d1-a456-426655440000";
const COB_URL = "pix.example.com/qr/v2/9d36b84fc70b478fb95c12729b90ca25";
const COBV_URL = "pix.example.com/qr/v2/cobv/2353c790eefb11eaadc10242ac120002";
const REC_URL = "pix.example.com/qr/v2/rec/7c1e2a40b77e4a3b9d6f0e15c2a8d931";

const cobPayload = {
  calendario: { criacao: "2026-10-02T14:03:11.402Z", apresentacao: "2026-10-02T14:05:47.118Z", expiracao: 3600 },
  txid: "7978c0c97ea847e78e8849634473c1f1",
  revisao: 0,
  status: "ATIVA",
  devedor: { cnpj: "12345678000195", nome: "Empresa de Serviços SA" },
  valor: { original: "37.00" },
  chave: KEY,
  solicitacaoPagador: "Informe o número do pedido",
  infoAdicionais: [{ nome: "Pedido", valor: "#88213" }],
};

export const KINDS: QrKind[] = [
  {
    id: "static-open",
    group: "static",
    label: "Static, no amount",
    product: "Pix (P2P / small merchant sticker)",
    input: { ...base, key: KEY },
    fetches: [],
    notes: [
      "Everything is in the image: key, name, city. No network call to the receiver's PSP — the payer's app goes straight to a DICT lookup on 26-01.",
      "No 54 → the payer types the amount. 62-05 = *** → no txid, so the receiver can only reconcile by time and amount.",
      "Reusable forever; it can be printed on a sticker.",
    ],
  },
  {
    id: "static-amount",
    group: "static",
    label: "Static, amount + txid",
    product: "Pix, fixed-price product or POS-generated static",
    input: { ...base, key: KEY, amount: "100.50", txid: "CAIXA03PEDIDO991", infoAdicional: "Pedido 991" },
    fetches: [],
    notes: [
      "54 pins the amount; 62-05 carries a txid of up to 25 chars [A-Za-z0-9] that the payer's PSP copies into pacs.008 <TxId>.",
      "Nobody registers this txid anywhere: the receiver's PSP cannot enforce uniqueness, and a printed static QR will repeat it on every payment. Querying GET /pix?txid=… is the only API-side reconciliation.",
      "infoAdicional (26-02) is shown to the payer; it shares the 99-char template budget with the key.",
    ],
  },
  {
    id: "static-saque",
    group: "static",
    label: "Static Pix Saque",
    product: "Pix Saque (cash withdrawal)",
    input: { ...base, key: KEY, amount: "200.00", fss: "12345678", name: "MERCADO BOA VISTA" },
    fetches: [],
    notes: [
      "The presence of 26-03 fss — the 8-char ISPB of the facilitador de serviço de saque — is what turns this into a Pix Saque QR. It costs 12 chars of the 99 budget (03 + 08 + value).",
      "Pix Troco (purchase + change) is NOT possible with static QRs, only with dynamic ones.",
    ],
  },
  {
    id: "dyn-cob",
    group: "dynamic",
    label: "Dynamic, cobrança imediata",
    product: "Pix Cobrança — immediate payment (cob)",
    input: { ...base, kind: "dynamic", url: COB_URL, unique: true },
    fetches: [{ label: "cob payload (JWS payload, decoded)", request: `GET https://${COB_URL}`, json: cobPayload }],
    notes: [
      "The image only carries a capability URL. The payer's PSP GETs it (HTTPS, application/jose), validates the JWS, and only then reads valor, chave and txid.",
      "calendario.expiracao defaults to 86400 s after criacao. apresentacao is when this payload was served.",
      "01 = 12 tells the app this QR should not be paid twice. A cob that is CONCLUIDA may be served with 404/410 or with its status — PSP's choice.",
    ],
  },
  {
    id: "dyn-cobv",
    group: "dynamic",
    label: "Dynamic, com vencimento",
    product: "Pix Cobrança — due-date bill (cobv), boleto-like",
    input: { ...base, kind: "dynamic", url: COBV_URL, unique: true },
    fetches: [
      {
        label: "cobv payload — computed for the payer's date & city",
        request: `GET https://${COBV_URL}?DPP=2026-10-20&codMun=5300108`,
        json: {
          calendario: { criacao: "2026-09-30T12:00:00.000Z", apresentacao: "2026-10-02T14:05:47.118Z", dataDeVencimento: "2026-10-15", validadeAposVencimento: 30 },
          devedor: { cpf: "12345678909", nome: "Francisco da Silva" },
          recebedor: { cnpj: "56989000019533", nome: "Escola Mundo Novo Ltda", logradouro: "Rua 15, 1200", cidade: "Belo Horizonte", uf: "MG", cep: "30140071" },
          txid: "fc9a4366ff3d4964b5dbc6c91a8722d3",
          revisao: 1,
          status: "ATIVA",
          valor: { original: "1250.00", multa: "25.00", juros: "2.08", final: "1277.08" },
          chave: KEY,
        },
      },
    ],
    notes: [
      "The URL path contains /cobv/. The payer's PSP appends DPP (data de pagamento pretendida) and codMun (IBGE municipality code, 7 digits) so the receiver's PSP can compute juros, multa and descontos including local holidays.",
      "Without DPP: before the due date the PSP assumes the due date; after it, the query date. Without codMun it assumes no state/municipal holidays.",
      "devedor is mandatory and recebedor (with address) is part of the payload — this is the boleto replacement.",
    ],
  },
  {
    id: "dyn-saque",
    group: "dynamic",
    label: "Dynamic Pix Saque",
    product: "Pix Saque via dynamic QR",
    input: { ...base, kind: "dynamic", url: COB_URL, unique: true, name: "MERCADO BOA VISTA" },
    fetches: [
      {
        label: "cob payload with valor.retirada.saque",
        request: `GET https://${COB_URL}`,
        json: {
          ...cobPayload,
          devedor: undefined,
          infoAdicionais: undefined,
          solicitacaoPagador: undefined,
          valor: { original: "0.00", modalidadeAlteracao: 0, retirada: { saque: { valor: "200.00", modalidadeAlteracao: 1, modalidadeAgente: "AGTEC", prestadorDoServicoDeSaque: "12345678" } } },
        },
      },
    ],
    notes: [
      "valor.original must be 0.00; the cash amount lives in valor.retirada.saque.valor. modalidadeAlteracao 1 lets the payer change it (a 0.00 suggestion forces them to type one).",
      "modalidadeAgente: AGTEC (merchant), AGTOT (other legal entity / correspondent) or AGPSS (the facilitator itself — deprecated in 2.10.0, mapped to AGFSS in pacs.008).",
      "saque and troco are mutually exclusive. Current limits (IN BCB 512/2024): up to R$ 3,000 per transaction from 06h to 20h, R$ 1,000 at night.",
    ],
  },
  {
    id: "dyn-troco",
    group: "dynamic",
    label: "Dynamic Pix Troco",
    product: "Pix Troco (purchase + cash back)",
    input: { ...base, kind: "dynamic", url: COB_URL, unique: true, name: "MERCADO BOA VISTA" },
    fetches: [
      {
        label: "cob payload with valor.retirada.troco",
        request: `GET https://${COB_URL}`,
        json: {
          ...cobPayload,
          devedor: undefined,
          infoAdicionais: undefined,
          solicitacaoPagador: undefined,
          valor: { original: "50.00", retirada: { troco: { valor: "100.00", modalidadeAlteracao: 0, modalidadeAgente: "AGTEC", prestadorDoServicoDeSaque: "12345678" } } },
        },
      },
    ],
    notes: [
      "valor.original (> 0) is the purchase; valor.retirada.troco.valor is the change. The purchase amount cannot be altered (valor.modalidadeAlteracao must be 0).",
      "The Pix that settles is original + troco = R$ 150.00; GET /pix reports the split in componentesValor.",
      "Troco agent modality is restricted to AGTEC or AGTOT.",
    ],
  },
  {
    id: "comp-j2",
    group: "composite",
    label: "Composite: recurrence only (Jornada 2)",
    product: "Pix Automático — authorise by scanning",
    input: { ...base, kind: "composite", recUrl: REC_URL },
    fetches: [
      {
        label: "rec payload",
        request: `GET https://${REC_URL}`,
        json: {
          idRec: "RN1234567820261002abcdefghijk",
          vinculo: { objeto: "Plano de streaming", contrato: "63100862", devedor: { cpf: "45164632481", nome: "Fulano de Tal" } },
          calendario: { dataInicial: "2026-11-01", periodicidade: "MENSAL" },
          valor: { valorRec: "35.00" },
          recebedor: { cnpj: "28765007802371", nome: "Startup Musical", ispbParticipante: "12345678" },
          politicaRetentativa: "PERMITE_3R_7D",
          atualizacao: [{ status: "CRIADA", data: "2026-10-02T10:12:07.567Z" }],
        },
      },
    ],
    notes: [
      "Template 26 holds only the GUI (EMV requires at least one Merchant Account Information), no key, no URL. Template 80 carries GUI + 25 = recurrence URL — mandatory for composite QRs.",
      "Scanning only creates an authorisation (the rec moves to APROVADA); no money moves now.",
    ],
  },
  {
    id: "comp-j3",
    group: "composite",
    label: "Composite: pay now + recurrence (Jornada 3)",
    product: "Pix Automático — first payment immediate",
    input: { ...base, kind: "composite", url: COB_URL, recUrl: REC_URL, unique: true },
    fetches: [
      { label: "cob payload (no retirada allowed)", request: `GET https://${COB_URL}`, json: { ...cobPayload, devedor: undefined, infoAdicionais: undefined } },
      {
        label: "rec payload",
        request: `GET https://${REC_URL}`,
        json: {
          idRec: "RN1234567820261002abcdefghijk",
          vinculo: { objeto: "Academia — plano mensal", contrato: "A-55120", devedor: { cpf: "45164632481", nome: "Fulano de Tal" } },
          calendario: { dataInicial: "2026-11-02", periodicidade: "MENSAL" },
          valor: { valorMinimoRecebedor: "89.90" },
          recebedor: { cnpj: "28765007802371", nome: "Academia Forma", ispbParticipante: "12345678" },
          politicaRetentativa: "NAO_PERMITE",
          atualizacao: [{ status: "CRIADA", data: "2026-10-02T10:12:07.567Z" }],
        },
      },
    ],
    notes: [
      "Two URLs, and both must share the same fqdnPspRecebedor. The first charge is a cob paid now; the rec's ativacao.dadosJornada.txid must match it.",
      "If either link fails, the payer's app must show an error and stop — no payment, no authorisation.",
      "Saque/Troco (valor.retirada) is forbidden in composite QRs.",
    ],
  },
  {
    id: "comp-j4",
    group: "composite",
    label: "Composite: bill + recurrence (Jornada 4)",
    product: "Pix Automático — offered on a due-date bill",
    input: { ...base, kind: "composite", url: COBV_URL, recUrl: REC_URL, unique: true },
    fetches: [
      { label: "cobv payload", request: `GET https://${COBV_URL}?DPP=2026-10-15&codMun=5300108`, json: { txid: "fc9a4366ff3d4964b5dbc6c91a8722d3", status: "ATIVA", valor: { original: "189.90", final: "189.90" }, "…": "same as cobv" } },
      { label: "rec payload", request: `GET https://${REC_URL}`, json: { idRec: "RN1234567820261002abcdefghijk", calendario: { dataInicial: "2026-11-15", periodicidade: "MENSAL" }, "…": "…" } },
    ],
    notes: [
      "The payment URL must contain /cobv/ (or the payment part is a static key + amount for a contract already in force).",
      "If the bill link fails (or the bill is already paid) → error. If only the recurrence link fails → the payer may still pay the bill normally, just without the Pix Automático offer.",
    ],
  },
];
