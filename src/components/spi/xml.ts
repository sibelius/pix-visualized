/**
 * Tiny XML model used by the message builders/viewers of the SPI chapters.
 * Every node can carry a plain-language `doc` that the viewer shows on hover.
 */
import { rng } from "@/lib/random";

export type XNode = {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  kids?: XNode[];
  /** explanation shown on hover */
  doc?: string;
  /** visual flag: rule violation or field that was just changed */
  flag?: "error" | "warn" | "hot";
};

/** Build a node. `body` is either the text content or the list of children (falsy entries are dropped). */
export function x(
  tag: string,
  body?: string | (XNode | false | null | undefined | "" | 0)[],
  doc?: string,
  extra?: Partial<XNode>,
): XNode {
  const n: XNode = { tag, doc, ...extra };
  if (typeof body === "string") n.text = body;
  else if (Array.isArray(body)) n.kids = body.filter(Boolean) as XNode[];
  return n;
}

export type XLine = {
  id: string;
  depth: number;
  kind: "open" | "close" | "leaf";
  node: XNode;
  path: string;
};

/** Flatten a tree into display lines, computing a slash path for each node. */
export function flatten(root: XNode): XLine[] {
  const out: XLine[] = [];
  const walk = (n: XNode, depth: number, parent: string, idx: number, pid = "") => {
    const path = parent ? `${parent}/${n.tag}` : n.tag;
    const id = `${pid}/${idx}:${n.tag}`;
    if (n.kids && n.kids.length) {
      out.push({ id, depth, kind: "open", node: n, path });
      n.kids.forEach((k, i) => walk(k, depth + 1, path, i, id));
      out.push({ id: id + "/close", depth, kind: "close", node: n, path });
    } else {
      out.push({ id, depth, kind: "leaf", node: n, path });
    }
  };
  walk(root, 0, "", 0);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function serialize(root: XNode, indent = 2): string {
  const lines: string[] = [];
  const walk = (n: XNode, d: number) => {
    const pad = " ".repeat(d * indent);
    const attrs = n.attrs ? Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("") : "";
    if (n.kids && n.kids.length) {
      lines.push(`${pad}<${n.tag}${attrs}>`);
      n.kids.forEach((k) => walk(k, d + 1));
      lines.push(`${pad}</${n.tag}>`);
    } else if (n.text !== undefined) {
      lines.push(`${pad}<${n.tag}${attrs}>${esc(n.text)}</${n.tag}>`);
    } else {
      lines.push(`${pad}<${n.tag}${attrs}/>`);
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

/* ---------------- identifiers ---------------- */

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const UPPER_ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function alnum(seed: number, n: number, alphabet = ALNUM) {
  const r = rng(seed);
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[r.int(0, alphabet.length - 1)];
  return s;
}

/** yyyyMMddHHmm in UTC from an ISO timestamp like 2026-10-02T14:03:27.512Z */
export function stamp12(iso: string) {
  return iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16);
}

/** MsgId / BizMsgIdr: M + ISPB(8) + 23 alphanumerics = 32 chars */
export const msgId = (ispb: string, seed: number) => `M${ispb}${alnum(seed, 23)}`;
/** EndToEndId: E + ISPB(8) + yyyyMMddHHmm + 11 alphanumerics = 32 chars */
export const e2eId = (ispb: string, iso: string, seed: number) => `E${ispb}${stamp12(iso)}${alnum(seed, 11)}`;
/** RtrId (idOperacao of a devolução): D + ISPB(8) + yyyyMMddHHmm + 11 alphanumerics */
export const rtrId = (ispb: string, iso: string, seed: number) => `D${ispb}${stamp12(iso)}${alnum(seed, 11)}`;
export const upperAlnum = (seed: number, n: number) => alnum(seed, n, UPPER_ALNUM);

export const E2E_RE = /^E[0-9A-Z]{8}[0-9]{4}[0-1][0-9][0-3][0-9][0-2][0-9][0-5][0-9][a-zA-Z0-9]{11}$/;
export const RTR_RE = /^D[0-9A-Z]{8}[0-9]{4}[0-1][0-9][0-3][0-9][0-2][0-9][0-5][0-9][a-zA-Z0-9]{11}$/;
export const MSGID_RE = /^M[0-9A-Z]{8}[a-zA-Z0-9]{23}$/;

/** Add milliseconds to an ISO timestamp (pure string math via Date on a fixed input — deterministic). */
export function addMs(iso: string, ms: number) {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/* ---------------- shared fictional participants ---------------- */

export const SPI_ISPB = "00038166"; // Banco Central do Brasil (the SPI itself)

export type Psp = { ispb: string; name: string };
export const PAYER_PSP: Psp = { ispb: "11223344", name: "Banco Aurora" };
export const PAYEE_PSP: Psp = { ispb: "55667788", name: "Fintech Boreal" };

/** AppHdr shared by every SPI message. */
export function appHdr(from: string, to: string, bizMsgIdr: string, msgDef: string, creDt: string): XNode {
  const fi = (id: string, d: string) => x("FIId", [x("FinInstnId", [x("Othr", [x("Id", id, d)])])]);
  return x(
    "AppHdr",
    [
      x("Fr", [fi(from, "ISPB of the sender of this message (8 chars). 00038166 when the SPI itself is sending.")], "Business sender of the message."),
      x("To", [fi(to, "ISPB of the addressee. 00038166 is the SPI (Banco Central).")], "Business addressee of the message."),
      x("BizMsgIdr", bizMsgIdr, "Same value as GrpHdr/MsgId: M + sender ISPB + 23 alphanumerics, unique per sender."),
      x("MsgDefIdr", msgDef, "Message definition and SPI catalog version, e.g. pacs.008.spi.1.16. Must match the XSD namespace version."),
      x("CreDt", creDt, "Creation time of the header, UTC with milliseconds."),
      x("Sgntr", undefined, "XMLDSig signature (enveloped) goes here: the sender signs the AppHdr+Document with its ICP-Brasil certificate. Shown empty here; see the XMLDSig chapter."),
    ],
    "ISO 20022 Business Application Header (head.001). Routing and identification; the signature lives inside it.",
  );
}

export const money2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
/** R$ 1.234,56 — formatted by hand so server and browser render identically. */
export function brl(v: number) {
  const neg = v < 0;
  const [int, dec] = money2(Math.abs(v)).split(".");
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "−" : ""}R$ ${withDots},${dec}`;
}
