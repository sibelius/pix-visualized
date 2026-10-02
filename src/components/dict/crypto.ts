/** WebCrypto helpers. Call only from effects / event handlers, never during render. */

const enc = new TextEncoder();

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmacSha256Hex(keyBytes: Uint8Array, message: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** bitwise XOR of two equal-length hex strings */
export function xorHex(a: string, b: string) {
  let out = "";
  for (let i = 0; i < a.length; i += 2) {
    out += (parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16)).toString(16).padStart(2, "0");
  }
  return out;
}

export const ZERO_VSYNC = "0".repeat(64);

export const vsyncOf = (cids: string[]) => cids.reduce(xorHex, ZERO_VSYNC);

/** UUID string → its 16 bytes (the RequestId used as HMAC key for the CID) */
export const uuidBytes = (uuid: string) => {
  const hex = uuid.replace(/-/g, "");
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
};

/** CID: HMAC-SHA256(requestIdBytes, keyType&key&taxId&name&tradeName&participant&branch&account&accountType) */
export type CidEntry = {
  keyType: string;
  key: string;
  taxId: string;
  name: string;
  tradeName: string;
  participant: string;
  branch: string;
  account: string;
  accountType: string;
};

export const entryAttributes = (e: CidEntry) =>
  [e.keyType, e.key, e.taxId, e.name, e.tradeName, e.participant, e.branch, e.account, e.accountType].join("&");
