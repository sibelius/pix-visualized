// BR Code (EMV QRCPS-MPM) building, parsing, validation and CRC16 — pure logic, no React.
// Sources: Manual de Padrões para Iniciação do Pix v2.10.0 (BCB), EMV QRCPS-MPM v1.1.

export const GUI = "br.gov.bcb.pix";

/* ----------------------------------------------------------------------------
 * CRC16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no final XOR.
 * Computed over the whole payload INCLUDING the "6304" of the CRC field itself.
 * -------------------------------------------------------------------------- */

export function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export function crc16(s: string): number {
  let crc = 0xffff;
  for (const b of utf8(s)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

export type CrcBitStep = {
  byteIndex: number;
  char: string;
  byte: number;
  bit: number; // 0..7
  before: number; // register before this bit shift
  msb: 0 | 1; // top bit before shifting
  after: number; // register after shift (and XOR with poly if msb=1)
  xored: boolean;
};

export type CrcByteStep = {
  byteIndex: number;
  char: string;
  byte: number;
  regIn: number; // register before this byte
  afterXorIn: number; // register ^ (byte << 8)
  bits: CrcBitStep[];
  regOut: number;
};

/** Full trace of the CRC computation, byte by byte and bit by bit. */
export function crcTrace(s: string, maxBytes = Infinity): CrcByteStep[] {
  const bytes = utf8(s);
  const out: CrcByteStep[] = [];
  let crc = 0xffff;
  for (let i = 0; i < bytes.length && i < maxBytes; i++) {
    const b = bytes[i];
    const regIn = crc;
    crc ^= b << 8;
    const afterXorIn = crc;
    const bits: CrcBitStep[] = [];
    for (let k = 0; k < 8; k++) {
      const before = crc;
      const msb = (crc & 0x8000 ? 1 : 0) as 0 | 1;
      crc = msb ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      bits.push({ byteIndex: i, char: String.fromCharCode(b), byte: b, bit: k, before, msb, after: crc, xored: msb === 1 });
    }
    out.push({ byteIndex: i, char: b < 128 ? String.fromCharCode(b) : "·", byte: b, regIn, afterXorIn, bits, regOut: crc });
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * TLV helpers
 * -------------------------------------------------------------------------- */

export const len2 = (v: string) => String(v.length).padStart(2, "0");
export const tlv = (id: string, value: string) => `${id}${len2(value)}${value}`;

/** Strip accents and characters outside printable ASCII (common practice for names/cities). */
export function asciiFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

export type BuildInput = {
  kind: "static" | "dynamic" | "composite";
  key: string; // static only (26-01)
  infoAdicional: string; // static only (26-02)
  fss: string; // static only (26-03) — ISPB of the saque facilitator → Pix Saque
  url: string; // dynamic (26-25)
  recUrl: string; // composite (80-25)
  amount: string; // 54
  name: string; // 59
  city: string; // 60
  cep: string; // 61
  txid: string; // 62-05
  unique: boolean; // 01 = 12
};

/** One emitted field, with its byte range in the final string, for colouring. */
export type Span = {
  path: string; // e.g. "26.01"
  id: string;
  len: string;
  value: string;
  start: number; // index of the ID in the full string
  end: number; // exclusive
  depth: number;
  children?: Span[];
};

type Node = { id: string; value?: string; children?: Node[] };

function emit(nodes: Node[], offset: number, depth: number, prefix: string): { str: string; spans: Span[] } {
  let str = "";
  const spans: Span[] = [];
  for (const n of nodes) {
    const start = offset + str.length;
    if (n.children) {
      const inner = emit(n.children, start + 4, depth + 1, prefix ? `${prefix}.${n.id}` : n.id);
      const seg = `${n.id}${len2(inner.str)}${inner.str}`;
      spans.push({ path: prefix ? `${prefix}.${n.id}` : n.id, id: n.id, len: len2(inner.str), value: inner.str, start, end: start + seg.length, depth, children: inner.spans });
      str += seg;
    } else {
      const v = n.value ?? "";
      const seg = `${n.id}${len2(v)}${v}`;
      spans.push({ path: prefix ? `${prefix}.${n.id}` : n.id, id: n.id, len: len2(v), value: v, start, end: start + seg.length, depth });
      str += seg;
    }
  }
  return { str, spans };
}

/** Build a Pix BR Code in the canonical order used by the Manual's examples. */
export function buildBrCode(inp: BuildInput): { code: string; spans: Span[]; crc: number } {
  const nodes: Node[] = [{ id: "00", value: "01" }];
  if (inp.unique) nodes.push({ id: "01", value: "12" });
  const mai: Node[] = [{ id: "00", value: GUI }];
  if (inp.kind === "static") {
    mai.push({ id: "01", value: inp.key });
    if (inp.infoAdicional) mai.push({ id: "02", value: inp.infoAdicional });
    if (inp.fss) mai.push({ id: "03", value: inp.fss });
  } else if (inp.kind === "dynamic") {
    mai.push({ id: "25", value: inp.url });
  } else {
    // composite: payment part may be static (key) or dynamic (url), or absent
    if (inp.url) mai.push({ id: "25", value: inp.url });
    else if (inp.key) mai.push({ id: "01", value: inp.key });
  }
  nodes.push({ id: "26", children: mai });
  nodes.push({ id: "52", value: "0000" });
  nodes.push({ id: "53", value: "986" });
  if (inp.amount && inp.kind !== "dynamic") nodes.push({ id: "54", value: inp.amount });
  nodes.push({ id: "58", value: "BR" });
  nodes.push({ id: "59", value: inp.name });
  nodes.push({ id: "60", value: inp.city });
  if (inp.cep) nodes.push({ id: "61", value: inp.cep });
  nodes.push({ id: "62", children: [{ id: "05", value: inp.txid || "***" }] });
  if (inp.kind === "composite") nodes.push({ id: "80", children: [{ id: "00", value: GUI }, { id: "25", value: inp.recUrl }] });
  const body = emit(nodes, 0, 0, "");
  const pre = body.str + "6304";
  const crc = crc16(pre);
  const code = pre + hex4(crc);
  body.spans.push({ path: "63", id: "63", len: "04", value: hex4(crc), start: body.str.length, end: code.length, depth: 0 });
  return { code, spans: body.spans, crc };
}

/* ----------------------------------------------------------------------------
 * Field dictionary (root and Pix templates)
 * -------------------------------------------------------------------------- */

export type FieldInfo = { name: string; desc: string; max?: number; min?: number; fixed?: string };

export const ROOT_FIELDS: Record<string, FieldInfo> = {
  "00": { name: "Payload Format Indicator", desc: "Always \"01\". Must be the first field.", fixed: "01", min: 2, max: 2 },
  "01": { name: "Point of Initiation Method", desc: "Optional. The BR Code defines only \"12\" = can be used once (the Manual's dynamic examples set it so the payer app can avoid re-paying). \"11\" (static) is EMV semantics that the BCB manuals never use; static Pix examples simply omit 01.", min: 2, max: 2 },
  "26": { name: "Merchant Account Information (Pix)", desc: "Template in the 26–51 range carrying the Pix arrangement: GUI br.gov.bcb.pix plus chave (static) or URL (dynamic). Max 99.", max: 99 },
  "52": { name: "Merchant Category Code", desc: "MCC. Pix uses \"0000\" (not informed).", min: 4, max: 4 },
  "53": { name: "Transaction Currency", desc: "ISO 4217 numeric. \"986\" = BRL.", fixed: "986", min: 3, max: 3 },
  "54": { name: "Transaction Amount", desc: "Optional; up to 13 chars, dot as decimal separator (e.g. 100.50). Ignored by the payer in dynamic QRs — the JSON payload wins.", max: 13 },
  "58": { name: "Country Code", desc: "ISO 3166-1 alpha-2. \"BR\".", fixed: "BR", min: 2, max: 2 },
  "59": { name: "Merchant Name", desc: "Mandatory in EMV but cosmetic in Pix: the payer app shows the name returned by DICT. Max 25.", min: 1, max: 25 },
  "60": { name: "Merchant City", desc: "Mandatory, max 15 characters.", min: 1, max: 15 },
  "61": { name: "Postal Code", desc: "Optional CEP (EMV 61).", max: 99 },
  "62": { name: "Additional Data Field Template", desc: "Holds 05 Reference Label = txid. Always present in a BR Code.", max: 99 },
  "63": { name: "CRC", desc: "CRC16/CCITT-FALSE over everything before it, including \"6304\". 4 uppercase hex digits. Must be last.", min: 4, max: 4 },
  "80": { name: "Unreserved Template (Pix)", desc: "Range 80–99. For composite QRs (Pix Automático) holds GUI + 25 = recurrence URL; mandatory there.", max: 99 },
};

export const PIX_MAI_FIELDS: Record<string, FieldInfo> = {
  "00": { name: "GUI", desc: "Globally Unique Identifier of the arrangement: br.gov.bcb.pix (reverse DNS, case-insensitive).", min: 14, max: 14 },
  "01": { name: "chave", desc: "Pix key (static QR). Email, CPF/CNPJ digits, +55 phone, or EVP UUID with hyphens. 1–77.", min: 1, max: 77 },
  "02": { name: "infoAdicional", desc: "Free text shown to the payer (static). Competes with the key for the 99-char template.", min: 1, max: 72 },
  "03": { name: "fss", desc: "ISPB (8 chars) of the facilitador de serviço de saque — its presence makes this a Pix Saque QR.", min: 8, max: 8 },
  "25": { name: "URL (location)", desc: "Payload location without https:// — {fqdn}/{endpoint}/{urlAccessToken}. Max 77.", min: 1, max: 77 },
};

export const ADF_FIELDS: Record<string, FieldInfo> = {
  "05": { name: "Reference Label (txid)", desc: "txid. Static: up to 25 chars [A-Za-z0-9], or \"***\" if none. Dynamic: ignored (the payload's txid wins).", min: 1, max: 25 },
};

export const UNRESERVED_FIELDS: Record<string, FieldInfo> = {
  "00": { name: "GUI", desc: "br.gov.bcb.pix", min: 14, max: 14 },
  "25": { name: "URL (recurrence)", desc: "Location of the recurrence payload (…/rec/…). Same FQDN as the payment URL when both are present.", min: 1, max: 77 },
};

/* ----------------------------------------------------------------------------
 * Parser + validator
 * -------------------------------------------------------------------------- */

export type Issue = { level: "error" | "warn"; path: string; msg: string };

export type ParsedField = {
  path: string;
  id: string;
  lenStr: string;
  value: string;
  start: number;
  end: number;
  depth: number;
  info?: FieldInfo;
  children?: ParsedField[];
  issues: Issue[];
};

export type ParseResult = {
  fields: ParsedField[];
  issues: Issue[];
  crcGiven?: string;
  crcComputed?: string;
  kind: "static" | "dynamic" | "composite" | "unknown";
  ok: boolean;
};

function parseLevel(s: string, base: number, depth: number, prefix: string, issues: Issue[]): ParsedField[] {
  const out: ParsedField[] = [];
  let i = 0;
  while (i < s.length) {
    const start = base + i;
    if (s.length - i < 4) {
      issues.push({ level: "error", path: prefix || "root", msg: `Trailing ${s.length - i} char(s) "${s.slice(i)}" cannot form an ID+length header.` });
      break;
    }
    const id = s.slice(i, i + 2);
    const lenStr = s.slice(i + 2, i + 4);
    const path = prefix ? `${prefix}.${id}` : id;
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) {
      issues.push({ level: "error", path, msg: `Expected 2-digit ID and 2-digit length at offset ${start}, got "${id}${lenStr}".` });
      break;
    }
    const len = Number(lenStr);
    const value = s.slice(i + 4, i + 4 + len);
    const f: ParsedField = { path, id, lenStr, value, start, end: start + 4 + value.length, depth, issues: [] };
    if (value.length < len) {
      f.issues.push({ level: "error", path, msg: `Declares length ${len} but only ${value.length} char(s) remain.` });
    }
    out.push(f);
    i += 4 + len;
  }
  return out;
}

const isPixTemplate = (f: ParsedField) => f.children?.some((c) => c.id === "00" && c.value.toLowerCase() === GUI);

export function validateKey(k: string): string | null {
  if (/^https?:\/\/|\//.test(k)) return "Looks like a URL in the chave field. A dynamic QR puts its location in 26-25 (without https://), not 26-01.";
  if (/^[0-9]{11}$/.test(k)) return null; // CPF
  if (/^[0-9A-Z]{12}[0-9]{2}$/.test(k)) return null; // CNPJ (alphanumeric from 2026)
  if (/^\+[1-9][0-9]{1,14}$/.test(k)) return null; // phone E.164
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)) return null; // EVP
  if (/^[a-z0-9.!#$&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(k) && k.length <= 77) return null; // email
  return "Not a valid DICT key format (CPF 11 digits, CNPJ 14, +55… phone, email, or lowercase EVP UUID).";
}

export function validateUrl(u: string): string | null {
  if (/^https?:\/\//i.test(u)) return "Location must NOT include the protocol prefix (it is always HTTPS).";
  if (u.length > 77) return `URL is ${u.length} chars; max 77.`;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?\/\S+$/i.test(u)) return "Expected {fqdn}/{path}/{urlAccessToken}.";
  return null;
}

export function parseBrCode(raw: string): ParseResult {
  const s = raw.replace(/[\r\n]/g, "");
  const issues: Issue[] = [];
  const fields = parseLevel(s, 0, 0, "", issues);
  const byId = new Map(fields.map((f) => [f.id, f] as const));

  // Order rules
  if (fields[0] && fields[0].id !== "00") issues.push({ level: "error", path: fields[0].path, msg: "First field must be 00 (Payload Format Indicator)." });
  const last = fields[fields.length - 1];
  if (last && last.id !== "63") issues.push({ level: "error", path: last.path, msg: "Last field must be 63 (CRC)." });
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.id)) f.issues.push({ level: "error", path: f.path, msg: `Duplicate root ID ${f.id}.` });
    seen.add(f.id);
  }

  // Templates: parse recursively
  let pixMai: ParsedField | undefined;
  let pixUnres: ParsedField | undefined;
  for (const f of fields) {
    const n = Number(f.id);
    if ((n >= 26 && n <= 51) || f.id === "62" || (n >= 80 && n <= 99)) {
      f.children = parseLevel(f.value, f.start + 4, 1, f.path, f.issues);
      if (n >= 26 && n <= 51) {
        f.info = isPixTemplate(f) ? ROOT_FIELDS["26"] : { name: "Merchant Account Information", desc: "Template of another arrangement (not br.gov.bcb.pix)." };
        if (isPixTemplate(f)) {
          if (pixMai) f.issues.push({ level: "warn", path: f.path, msg: "More than one Pix MAI template." });
          pixMai = pixMai ?? f;
          for (const c of f.children) c.info = PIX_MAI_FIELDS[c.id];
        }
      } else if (f.id === "62") {
        f.info = ROOT_FIELDS["62"];
        for (const c of f.children) c.info = ADF_FIELDS[c.id] ?? { name: `Additional data ${c.id}`, desc: "EMV additional data object (not used by Pix)." };
      } else {
        f.info = isPixTemplate(f) ? ROOT_FIELDS["80"] : { name: "Unreserved Template", desc: "Template of another scheme." };
        if (isPixTemplate(f)) {
          pixUnres = f;
          for (const c of f.children) c.info = UNRESERVED_FIELDS[c.id];
        }
      }
    } else {
      f.info = ROOT_FIELDS[f.id] ?? { name: `EMV field ${f.id}`, desc: "Not used by Pix." };
    }
  }

  // Per-field length/format checks
  const check = (f: ParsedField) => {
    const inf = f.info;
    if (inf) {
      if (inf.max !== undefined && f.value.length > inf.max) f.issues.push({ level: "error", path: f.path, msg: `${inf.name}: ${f.value.length} chars exceeds max ${inf.max}.` });
      if (inf.min !== undefined && f.value.length < inf.min) f.issues.push({ level: "error", path: f.path, msg: `${inf.name}: ${f.value.length} chars below min ${inf.min}.` });
      if (inf.fixed && f.value !== inf.fixed) f.issues.push({ level: "error", path: f.path, msg: `${inf.name} must be "${inf.fixed}", got "${f.value}".` });
    }
    f.children?.forEach(check);
  };
  fields.forEach(check);

  const pf = byId.get("01");
  if (pf && pf.value !== "11" && pf.value !== "12") pf.issues.push({ level: "error", path: pf.path, msg: "Point of Initiation Method must be 12 (or EMV's 11)." });
  if (pf && pf.value === "11") pf.issues.push({ level: "warn", path: pf.path, msg: "\"11\" is EMV-valid but not defined by the BCB; static Pix codes normally omit 01." });
  const amt = byId.get("54");
  if (amt && !/^\d{1,10}\.\d{2}$/.test(amt.value)) amt.issues.push({ level: "warn", path: amt.path, msg: "Amount should look like 123.45 (dot, 2 decimals; Pix values follow \\d{1,10}\\.\\d{2})." });
  if (amt && Number(amt.value) <= 0) amt.issues.push({ level: "warn", path: amt.path, msg: "Amount zero — omit 54 instead to let the payer type it." });

  for (const id of ["00", "52", "53", "58", "59", "60", "62", "63"]) {
    if (!byId.has(id)) issues.push({ level: "error", path: id, msg: `Missing mandatory field ${id} (${ROOT_FIELDS[id].name}).` });
  }
  if (!pixMai) issues.push({ level: "error", path: "26", msg: "No Merchant Account Information template with GUI br.gov.bcb.pix (IDs 26–51)." });

  // Kind
  let kind: ParseResult["kind"] = "unknown";
  const mc = new Map((pixMai?.children ?? []).map((c) => [c.id, c] as const));
  const hasKey = mc.has("01");
  const hasUrl = mc.has("25");
  if (pixUnres) kind = "composite";
  else if (hasUrl) kind = "dynamic";
  else if (hasKey) kind = "static";
  if (pixMai) {
    if (kind === "unknown") pixMai.issues.push({ level: "error", path: pixMai.path, msg: "Pix template has neither 01 (chave) nor 25 (URL)." });
    if (hasKey && hasUrl) pixMai.issues.push({ level: "warn", path: pixMai.path, msg: "Both chave and URL present; the payer will follow the URL." });
    const k = mc.get("01");
    if (k) {
      const e = validateKey(k.value);
      if (e) k.issues.push({ level: "warn", path: k.path, msg: e });
    }
    const u = mc.get("25");
    if (u) {
      const e = validateUrl(u.value);
      if (e) u.issues.push({ level: "error", path: u.path, msg: e });
    }
    if (mc.has("03") && kind !== "static") mc.get("03")!.issues.push({ level: "warn", path: `${pixMai.path}.03`, msg: "fss only applies to static QRs." });
  }
  if (pixUnres) {
    const ru = pixUnres.children?.find((c) => c.id === "25");
    if (!ru) pixUnres.issues.push({ level: "error", path: pixUnres.path, msg: "Composite QR needs 80.25 (recurrence URL)." });
    else {
      const e = validateUrl(ru.value);
      if (e) ru.issues.push({ level: "error", path: ru.path, msg: e });
      const pu = mc.get("25");
      if (pu && pu.value.split("/")[0].toLowerCase() !== ru.value.split("/")[0].toLowerCase())
        ru.issues.push({ level: "error", path: ru.path, msg: "Payment URL and recurrence URL must share the same fqdnPspRecebedor." });
    }
  }
  const adf = byId.get("62");
  const txid = adf?.children?.find((c) => c.id === "05");
  if (adf && !txid) adf.issues.push({ level: "error", path: adf.path, msg: "62 must contain 05 (Reference Label / txid); use \"***\" when there is none." });
  if (txid && txid.value !== "***" && !/^[A-Za-z0-9]+$/.test(txid.value)) txid.issues.push({ level: "error", path: txid.path, msg: "txid may only contain A–Z, a–z, 0–9 (or be exactly \"***\")." });
  if (txid && kind === "dynamic" && txid.value !== "***") txid.issues.push({ level: "warn", path: txid.path, msg: "In a dynamic QR this txid is ignored; the payload's txid wins." });
  if (amt && kind === "dynamic") amt.issues.push({ level: "warn", path: amt.path, msg: "In a dynamic QR 54 is ignored; the payload's valor wins." });

  // CRC
  let crcGiven: string | undefined;
  let crcComputed: string | undefined;
  const crcF = byId.get("63");
  if (crcF) {
    crcGiven = crcF.value.toUpperCase();
    crcComputed = hex4(crc16(s.slice(0, crcF.start + 4)));
    if (crcF.value !== crcF.value.toUpperCase()) crcF.issues.push({ level: "warn", path: "63", msg: "CRC hex should be uppercase." });
    if (crcGiven !== crcComputed) crcF.issues.push({ level: "error", path: "63", msg: `CRC mismatch: string says ${crcGiven}, computed ${crcComputed}.` });
    if (crcF.lenStr !== "04") crcF.issues.push({ level: "error", path: "63", msg: "CRC field length must be 04." });
  }

  const all: Issue[] = [...issues];
  const collect = (f: ParsedField) => {
    all.push(...f.issues);
    f.children?.forEach(collect);
  };
  fields.forEach(collect);
  return { fields, issues: all, crcGiven, crcComputed, kind, ok: !all.some((x) => x.level === "error") };
}

/* ----------------------------------------------------------------------------
 * Examples (verbatim from the Manual de Padrões v2.10.0)
 * -------------------------------------------------------------------------- */

export const EXAMPLES: { label: string; code: string }[] = [
  {
    label: "Manual §2.6.3 static",
    code: "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  },
  {
    label: "Manual §2.7.2 dynamic",
    code: "00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***630464E4",
  },
  {
    label: "§2.8.5.1 composite (rec only)",
    code: "00020126180014br.gov.bcb.pix5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304F2DA",
  },
  {
    label: "§2.8.5.3 composite (cob + rec)",
    code: "00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304FB42",
  },
  {
    label: "Broken (find the bugs)",
    code: "00020126600014br.gov.bcb.pix0138https://pix.example.com/8b3da2f39a41405204000053039865802BR5930LOJA DE ROUPAS E ACESSORIOS DA6008BRASILIA62100506pix-01630400AA",
  },
];
