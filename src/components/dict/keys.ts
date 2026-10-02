/**
 * Pix key (chave Pix) detection, normalization and validation, following the
 * DICT API v2 key regexes and the Manual Operacional do DICT (v8.5).
 */

export type KeyType = "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP";

export type Check = { label: string; ok: boolean; detail?: string };

export type DigitTrace = {
  /** which verifier digit (1 or 2) */
  dv: 1 | 2;
  rows: { ch: string; value: number; weight: number; product: number }[];
  sum: number;
  rem: number;
  digit: number;
};

export type KeyAnalysis = {
  type: KeyType | null;
  normalized: string;
  checks: Check[];
  valid: boolean;
  /** extra note, e.g. an 11-digit input that could be a CPF or a phone */
  ambiguity?: string;
  traces?: DigitTrace[];
};

/** Regexes copied from the DICT API v2 "Chave" table. */
export const KEY_REGEX: Record<KeyType, RegExp> = {
  CPF: /^[0-9]{11}$/,
  CNPJ: /^[a-z0-9]{14}$/i,
  PHONE: /^\+[1-9]\d{1,14}$/,
  EMAIL:
    /^[a-z0-9.!#$'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
  EVP: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
};

export const KEY_REGEX_SRC: Record<KeyType, string> = {
  CPF: "^[0-9]{11}$",
  CNPJ: "^(?i)[a-z0-9]{14}$",
  PHONE: "^\\+[1-9]\\d{1,14}$",
  EMAIL: "^[a-z0-9.!#$'*+\\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:…))*$",
  EVP: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
};

/** value of a CPF/CNPJ character in the mod-11 sum: ASCII code − 48 (so '0'..'9' → 0..9, 'A' → 17 … 'Z' → 42). */
const charValue = (c: string) => c.toUpperCase().charCodeAt(0) - 48;

function mod11(chars: string, weights: number[], dv: 1 | 2): DigitTrace {
  const rows = chars.split("").map((ch, i) => {
    const value = charValue(ch);
    return { ch, value, weight: weights[i], product: value * weights[i] };
  });
  const sum = rows.reduce((a, r) => a + r.product, 0);
  const rem = sum % 11;
  return { dv, rows, sum, rem, digit: rem < 2 ? 0 : 11 - rem };
}

export function cpfTraces(cpf: string): DigitTrace[] {
  const base = cpf.slice(0, 9);
  const t1 = mod11(base, [10, 9, 8, 7, 6, 5, 4, 3, 2], 1);
  const t2 = mod11(base + t1.digit, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2], 2);
  return [t1, t2];
}

export function cnpjTraces(cnpj: string): DigitTrace[] {
  const base = cnpj.slice(0, 12).toUpperCase();
  const t1 = mod11(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], 1);
  const t2 = mod11(base + t1.digit, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], 2);
  return [t1, t2];
}

export const cpfValid = (s: string) => {
  if (!/^\d{11}$/.test(s) || /^(\d)\1{10}$/.test(s)) return false;
  const [a, b] = cpfTraces(s);
  return s[9] === String(a.digit) && s[10] === String(b.digit);
};

export const cnpjValid = (s: string) => {
  if (!/^[A-Za-z0-9]{12}\d{2}$/.test(s) || /^(\d)\1{13}$/.test(s)) return false;
  const [a, b] = cnpjTraces(s);
  return s[12] === String(a.digit) && s[13] === String(b.digit);
};

/** Complete a 9-digit CPF base with its two verifier digits. */
export const cpfWithDv = (base9: string) => {
  const [a] = cpfTraces(base9 + "00");
  const b = mod11(base9 + a.digit, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2], 2);
  return base9 + a.digit + b.digit;
};

export const cnpjWithDv = (base12: string) => {
  const a = mod11(base12.toUpperCase(), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], 1);
  const b = mod11(base12.toUpperCase() + a.digit, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], 2);
  return base12.toUpperCase() + a.digit + b.digit;
};

/** What the payer may see (Manual Operacional do DICT §8.1): ***.777.888-** */
export const maskCpf = (cpf: string) => `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
export const fmtCpf = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
export const fmtCnpj = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

const looksLikeBrMobile = (d: string) => /^[1-9][1-9]9\d{8}$/.test(d); // DDD + 9 + 8 digits

export function analyzeKey(raw: string): KeyAnalysis {
  const input = raw.trim();
  if (!input) return { type: null, normalized: "", checks: [], valid: false };

  // EVP: a UUID (DICT generates it; stored in lowercase)
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(input)) {
    const hex = input.replace(/-/g, "").toLowerCase();
    const n = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const v4 = n[14] === "4" && /[89ab]/.test(n[19]);
    return {
      type: "EVP",
      normalized: n,
      valid: KEY_REGEX.EVP.test(n),
      checks: [
        { label: "matches the EVP regex (36 chars, lowercase hex)", ok: KEY_REGEX.EVP.test(n) },
        {
          label: "UUID version nibble",
          ok: true,
          detail: v4 ? "v4 (random): what the DICT generates" : `version ${n[14]}: the regex accepts it, but the DICT only issues random (v4) EVPs`,
        },
        { label: "only the DICT can create it", ok: true, detail: "the PSP asks for an EVP and the DICT returns it in CreateEntryResponse" },
      ],
    };
  }

  if (input.includes("@")) {
    const n = input.toLowerCase();
    const re = KEY_REGEX.EMAIL.test(n);
    return {
      type: "EMAIL",
      normalized: n,
      valid: re && n.length <= 77,
      checks: [
        { label: "lowercased", ok: true, detail: input === n ? "already lowercase" : `${input} → ${n}` },
        { label: "≤ 77 characters", ok: n.length <= 77, detail: `${n.length} chars` },
        {
          label: "matches the EMAIL regex",
          ok: re,
          detail: re ? undefined : /[%&]/.test(n) ? "'%' and '&' are not in the allowed local-part set" : "invalid local part or domain",
        },
      ],
    };
  }

  const stripped = input.replace(/[\s().\-/]/g, "");

  if (stripped.startsWith("+")) {
    const ok = KEY_REGEX.PHONE.test(stripped);
    const br = stripped.startsWith("+55");
    const brOk = !br || looksLikeBrMobile(stripped.slice(3));
    return {
      type: "PHONE",
      normalized: stripped,
      valid: ok && brOk,
      checks: [
        { label: "E.164: '+', country code, up to 15 digits", ok, detail: `${stripped.length - 1} digits` },
        br
          ? { label: "Brazilian mobile: +55 DDD 9XXXX-XXXX", ok: brOk, detail: brOk ? `DDD ${stripped.slice(3, 5)}` : "expected 2-digit DDD, then 9, then 8 digits" }
          : { label: "non-Brazilian number", ok: true, detail: "the regex accepts any country; PSPs validate possession by SMS code" },
      ],
    };
  }

  if (/^\d{11}$/.test(stripped)) {
    const isCpf = cpfValid(stripped);
    const phoneLike = looksLikeBrMobile(stripped);
    if (isCpf || !phoneLike) {
      return {
        type: "CPF",
        normalized: stripped,
        valid: isCpf,
        traces: cpfTraces(stripped),
        ambiguity: isCpf && phoneLike ? `Also shaped like a mobile number (+55${stripped}). The app must ask which one the user meant.` : undefined,
        checks: [
          { label: "11 digits, punctuation removed", ok: true, detail: input !== stripped ? `${input} → ${stripped}` : undefined },
          { label: "not all the same digit", ok: !/^(\d)\1{10}$/.test(stripped) },
          { label: "verifier digits (mod 11)", ok: isCpf, detail: `expected ${cpfTraces(stripped).map((t) => t.digit).join("")}, got ${stripped.slice(9)}` },
        ],
      };
    }
    // 11 digits, fails CPF, but looks like DDD + mobile: suggest PHONE
    const n = "+55" + stripped;
    return {
      type: "PHONE",
      normalized: n,
      valid: true,
      ambiguity: "Not a valid CPF, but a valid DDD + mobile shape: the app should prepend +55.",
      checks: [{ label: "interpreted as Brazilian mobile, +55 prepended", ok: true, detail: n }],
    };
  }

  if (/^[A-Za-z0-9]{14}$/.test(stripped)) {
    const n = stripped.toUpperCase();
    const ok = cnpjValid(n);
    const alpha = /[A-Z]/.test(n.slice(0, 12));
    return {
      type: "CNPJ",
      normalized: n,
      valid: ok,
      traces: /^\d{2}$/.test(n.slice(12)) ? cnpjTraces(n) : undefined,
      checks: [
        { label: "14 chars, punctuation removed", ok: true, detail: input !== stripped ? `${input} → ${n}` : undefined },
        {
          label: alpha ? "alphanumeric CNPJ (new format)" : "numeric CNPJ",
          ok: /^\d{2}$/.test(n.slice(12)),
          detail: alpha ? "first 12 chars may be A–Z/0–9; the 2 verifier digits are always numeric" : "classic format, still valid",
        },
        { label: "verifier digits (mod 11, value = ASCII − 48)", ok, detail: /^\d{2}$/.test(n.slice(12)) ? `expected ${cnpjTraces(n).map((t) => t.digit).join("")}, got ${n.slice(12)}` : undefined },
      ],
    };
  }

  if (/^\d{10}$/.test(stripped) && /^[1-9][1-9]\d{8}$/.test(stripped)) {
    return {
      type: "PHONE",
      normalized: "+55" + stripped,
      valid: false,
      checks: [{ label: "10 digits looks like a landline", ok: false, detail: "Pix PHONE keys are mobile numbers (DDD + 9 + 8 digits)" }],
    };
  }

  return { type: null, normalized: stripped, valid: false, checks: [{ label: "no key type matches", ok: false }] };
}

export const CLAIMABLE: Record<KeyType, { ownership: boolean; portability: boolean }> = {
  CPF: { ownership: false, portability: true },
  CNPJ: { ownership: false, portability: true },
  PHONE: { ownership: true, portability: true },
  EMAIL: { ownership: false, portability: true },
  EVP: { ownership: false, portability: false },
};
