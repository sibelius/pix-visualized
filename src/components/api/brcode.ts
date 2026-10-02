/** Minimal BR Code helpers for the API chapter (pixCopiaECola of a dynamic cob). */

/** CRC16-CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no xorout. */
export function crc16(s: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;

/** Dynamic BR Code: 26.25 carries the location (no https:// prefix), 62.05 = "***" (txid comes from the JWS payload). */
export function dynamicBrCode(location: string, name = "EMPRESA DE SERVICOS SA", city = "SAO PAULO"): string {
  const body =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("25", location)) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("58", "BR") +
    tlv("59", name.slice(0, 25)) +
    tlv("60", city.slice(0, 15)) +
    tlv("62", tlv("05", "***")) +
    "6304";
  return body + crc16(body);
}
