/**
 * SPI identifiers, per the XSD patterns and XLSX filling rules of spi.5.13.1:
 *   MsgIdType      [M][0-9A-Z]{8}[a-zA-Z0-9]{23}                                  (32 chars)
 *   EndToEndIdType [E][0-9A-Z]{8}[0-9]{4}[0-1][0-9][0-3][0-9][0-2][0-9][0-5][0-9][a-zA-Z0-9]{11}  (32 chars)
 *   RtrId (pacs.004) uses the same shape with a leading D.
 * The SPI also accepts the EndToEndId timestamp only within ±12 h of when it processes the order.
 */

export type Segment = {
  id: string;
  label: string;
  len: number;
  color: string;
  /** per-character allowed set */
  re: RegExp;
  hint: string;
};

export const MSGID_SEGMENTS: Segment[] = [
  { id: "m", label: "M", len: 1, color: "#818cf8", re: /^M$/, hint: "fixed letter M" },
  { id: "ispb", label: "ISPB", len: 8, color: "#32bcad", re: /^[0-9A-Z]$/, hint: "ISPB of the sender, [0-9A-Z]{8}" },
  { id: "seq", label: "unique part", len: 23, color: "#f5a524", re: /^[a-zA-Z0-9]$/, hint: "23 chars [a-zA-Z0-9], case-sensitive, never reused by this sender" },
];

export const E2E_SEGMENTS: Segment[] = [
  { id: "e", label: "E", len: 1, color: "#818cf8", re: /^[ED]$/, hint: "E (payment) — D marks a pacs.004 return id" },
  { id: "ispb", label: "ISPB", len: 8, color: "#32bcad", re: /^[0-9A-Z]$/, hint: "ISPB of whoever generated it: direct PSP, indirect PSP, or the first 8 of the initiator's CNPJ" },
  { id: "yyyy", label: "yyyy", len: 4, color: "#22d3ee", re: /^[0-9]$/, hint: "year (UTC)" },
  { id: "MM", label: "MM", len: 2, color: "#22d3ee", re: /^[0-9]$/, hint: "month 01–12 (XSD only checks [0-1][0-9])" },
  { id: "dd", label: "dd", len: 2, color: "#22d3ee", re: /^[0-9]$/, hint: "day (XSD only checks [0-3][0-9])" },
  { id: "HH", label: "HH", len: 2, color: "#22d3ee", re: /^[0-9]$/, hint: "hour UTC (XSD only checks [0-2][0-9])" },
  { id: "mm", label: "mm", len: 2, color: "#22d3ee", re: /^[0-9]$/, hint: "minute UTC" },
  { id: "seq", label: "sequence", len: 11, color: "#f5a524", re: /^[a-zA-Z0-9]$/, hint: "11 chars [a-zA-Z0-9], unique within that minute for that generator" },
];

export const MSGID_RE = /^M[0-9A-Z]{8}[a-zA-Z0-9]{23}$/;
export const E2E_RE = /^E[0-9A-Z]{8}[0-9]{4}[0-1][0-9][0-3][0-9][0-2][0-9][0-5][0-9][a-zA-Z0-9]{11}$/;

export type CharCheck = { ch: string; seg: Segment | null; ok: boolean };

export function checkChars(value: string, segs: Segment[]): CharCheck[] {
  const out: CharCheck[] = [];
  let i = 0;
  for (const s of segs) {
    for (let k = 0; k < s.len; k++, i++) {
      if (i < value.length) out.push({ ch: value[i], seg: s, ok: s.re.test(value[i]) });
    }
  }
  for (; i < value.length; i++) out.push({ ch: value[i], seg: null, ok: false });
  return out;
}

export type Issue = { level: "bad" | "warn" | "ok"; text: string };

export function validateMsgId(v: string): Issue[] {
  const out: Issue[] = [];
  if (v.length !== 32) out.push({ level: "bad", text: `length ${v.length}, must be exactly 32` });
  if (!MSGID_RE.test(v)) out.push({ level: "bad", text: "does not match MsgIdType pattern M[0-9A-Z]{8}[a-zA-Z0-9]{23}" });
  else out.push({ level: "ok", text: "XSD pattern MsgIdType: valid" });
  return out;
}

/** Parse the UTC minute embedded in an EndToEndId; null if not a real calendar minute. */
export function e2eInstant(v: string): Date | null {
  const m = /^[ED][0-9A-Z]{8}(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== h || dt.getUTCMinutes() !== mi)
    return null;
  return dt;
}

export function validateE2E(v: string, spiNowUtc: Date): Issue[] {
  const out: Issue[] = [];
  if (v.length !== 32) out.push({ level: "bad", text: `length ${v.length}, must be exactly 32` });
  if (v[0] === "D") out.push({ level: "warn", text: "a leading D is a pacs.004 RtrId, not an EndToEndId (EndToEndIdType requires E)" });
  const xsd = E2E_RE.test(v);
  out.push(xsd ? { level: "ok", text: "XSD pattern EndToEndIdType: valid" } : { level: "bad", text: "fails the XSD pattern EndToEndIdType" });
  if (v.length >= 21) {
    const at = e2eInstant(v);
    if (!at) out.push({ level: "bad", text: "timestamp is not a real UTC date/time (the XSD pattern alone would let e.g. month 19 or day 39 through)" });
    else {
      const diffH = (at.getTime() - spiNowUtc.getTime()) / 3_600_000;
      if (Math.abs(diffH) > 12)
        out.push({ level: "bad", text: `timestamp is ${diffH > 0 ? "+" : ""}${diffH.toFixed(1)} h from the SPI clock: outside the ±12 h tolerance` });
      else out.push({ level: "ok", text: `timestamp ${diffH >= 0 ? "+" : ""}${diffH.toFixed(2)} h from the SPI clock (within ±12 h)` });
    }
  }
  return out;
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomAlnum(n: number, next: () => number) {
  let s = "";
  for (let i = 0; i < n; i++) s += ALNUM[Math.floor(next() * ALNUM.length)];
  return s;
}

export const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function utcStamp(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

export function makeE2E(ispb: string, at: Date, next: () => number) {
  return `E${ispb}${utcStamp(at)}${randomAlnum(11, next)}`;
}

export function makeMsgId(ispb: string, next: () => number) {
  return `M${ispb}${randomAlnum(23, next)}`;
}

/** Tiny stable hash of a payload, used to compare "same content?" in the idempotency demo. */
export function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
