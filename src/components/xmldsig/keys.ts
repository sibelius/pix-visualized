"use client";

import { generateRsaKey, ISSUER, type Registry } from "./dsig";

export const SERIAL_A = "20260130224837516000";
export const SERIAL_B = "20250815101112131415";

let cache: Promise<{ a: CryptoKeyPair; b: CryptoKeyPair }> | null = null;

/** Two RSA-2048 key pairs generated once per page (call only from effects/handlers). */
export function demoKeys() {
  if (!cache) cache = Promise.all([generateRsaKey(), generateRsaKey()]).then(([a, b]) => ({ a, b }));
  return cache;
}

export function registryOf(k: { a: CryptoKeyPair; b: CryptoKeyPair }): Registry {
  return new Map([
    [`${ISSUER}|${SERIAL_A}`, { key: k.a.publicKey, label: "CERTPIA of ISPB 99999010 (active)" }],
    [`${ISSUER}|${SERIAL_B}`, { key: k.b.publicKey, label: "CERTPIA of ISPB 99999020 (active)" }],
  ]);
}
