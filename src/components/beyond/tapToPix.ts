/** "Tap to Pix" (Especificações do Pix por aproximação para Android v1.0, 05/06/2025): the POS emits a pix:// URI inside an NDEF
 * message over ISO 7816-4 APDUs (SELECT by AID, then UPDATE BINARY chunks). Everything here runs for real on the input string. */

export const TAP_TO_PIX_AID = [0xa0, 0x00, 0x00, 0x09, 0x40, 0xbc, 0xb0, 0x00];

/** CRC16/CCITT-FALSE as used by the BR Code (poly 0x1021, init 0xFFFF). */
export function crc16(s: string) {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (id: string, v: string) => id + String(v.length).padStart(2, "0") + v;

export function sampleBrCode(location: string) {
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("25", location);
  const body =
    tlv("00", "01") + tlv("01", "12") + tlv("26", mai) + tlv("52", "0000") + tlv("53", "986") + tlv("58", "BR") + tlv("59", "PADARIA BOM PAO LTDA") + tlv("60", "SAO PAULO") + tlv("62", tlv("05", "***")) + "6304";
  return body + crc16(body);
}

export function checkCrc(code: string) {
  const i = code.lastIndexOf("6304");
  if (i < 0 || code.length !== i + 8) return { ok: false, expected: "" };
  const expected = crc16(code.slice(0, i + 4));
  return { ok: expected === code.slice(i + 4).toUpperCase(), expected };
}

export function pixUri(host: string, copiaECola: string) {
  return `pix://${host}?qr=${encodeURIComponent(copiaECola)}`;
}

/** One NDEF record, TNF=well-known (0x01), type "U" (0x55), URI identifier code 0x00 (no abbreviation).
 * Short record (SR=1, header 0xD1) when payload ≤ 255 bytes, otherwise long (header 0xC1, 4-byte length). */
export function ndefMessage(uri: string) {
  const payload = [0x00, ...new TextEncoder().encode(uri)];
  const short = payload.length <= 255;
  const header = short ? [0xd1, 0x01, payload.length] : [0xc1, 0x01, (payload.length >>> 24) & 255, (payload.length >>> 16) & 255, (payload.length >>> 8) & 255, payload.length & 255];
  return { bytes: [...header, 0x55, ...payload], short, payloadLen: payload.length, headerLen: header.length + 1 };
}

export type Apdu = { label: string; bytes: number[]; head: number; note: string };

export function apdus(ndef: number[], chunk: number): Apdu[] {
  const select: Apdu = {
    label: "SELECT AID",
    bytes: [0x00, 0xa4, 0x04, 0x00, TAP_TO_PIX_AID.length, ...TAP_TO_PIX_AID, 0x00],
    head: 5,
    note: "CLA 00 · INS A4 · P1 04 (by AID) · P2 00 · Lc 08 · AID · Le 00 → expect 90 00",
  };
  const out: Apdu[] = [select];
  for (let off = 0; off < ndef.length; off += chunk) {
    const part = ndef.slice(off, off + chunk);
    const p1 = (off >>> 8) & 0x7f;
    const p2 = off & 0xff;
    const lc = part.length <= 255 ? [part.length] : [0x00, (part.length >>> 8) & 255, part.length & 255];
    out.push({
      label: `UPDATE BINARY @${off}`,
      bytes: [0x00, 0xd6, p1, p2, ...lc, ...part],
      head: 4 + lc.length,
      note: `offset ${off} in P1P2 (15 bits) · Lc ${part.length} · ${part.length} bytes of the NDEF message → 90 00`,
    });
  }
  return out;
}

export const hex = (bs: number[]) => bs.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
