/**
 * A small validator for the simple types the SPI XSDs (spi.5.13.1) actually use. Each facet is checked
 * separately so the UI can show which one fails. XSD patterns are implicitly anchored (whole value).
 */

export type Facet = { name: string; ok: boolean; level?: "bad" | "warn"; detail: string };
export type XsdType = {
  id: string;
  base: string;
  decl: string;
  where: string;
  samples: string[];
  check: (v: string, attr?: string) => Facet[];
};

const f = (name: string, ok: boolean, detail: string, level: "bad" | "warn" = "bad"): Facet => ({ name, ok, detail, level });

function realDate(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Catálogo de Serviços do SFN: Caractere ::= #x9 | #xA | #xD | [#x20-#x7E] | #x85 | [#xA0-#xFF] */
export const charsetOk = (v: string) => /^[\u0009\u000A\u000D\u0020-\u007E\u0085\u00A0-\u00FF]*$/.test(v);

function maxText(n: number) {
  return (v: string): Facet[] => {
    const len = [...v].length;
    return [
      f("minLength 1", len >= 1, "empty strings are not allowed (omit the element instead)"),
      f(`maxLength ${n}`, len <= n, `${len} characters (counted as Unicode characters, not bytes)`),
      f("SFN character set", charsetOk(v), charsetOk(v) ? "Basic Latin + Latin-1 only" : `outside #x20–#x7E / #xA0–#xFF: ${[...v].filter((c) => !charsetOk(c)).slice(0, 4).join(" ")} — the Catálogo de Serviços do SFN rejects it`),
      f("no leading/trailing space", v === v.trim(), "XSD allows it, but it is almost always a bug in the producer", "warn"),
    ];
  };
}

export function cpfOk(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const d = c.split("").map(Number);
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}

/** CNPJ check digits, including the alphanumeric CNPJ (char value = ASCII code − 48). */
export function cnpjOk(c: string) {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const v = c.split("").map((ch) => ch.charCodeAt(0) - 48);
  const dv = (n: number) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < n; i++) s += v[i] * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === v[12] && dv(13) === v[13];
}

export const XSD_TYPES: XsdType[] = [
  {
    id: "ActiveCurrencyAndAmount",
    base: "xs:decimal + @Ccy",
    decl: "totalDigits 18 · fractionDigits 2 · minInclusive 0 · @Ccy ∈ {BRL}",
    where: "IntrBkSttlmAmt, RtrdIntrBkSttlmAmt, AdjstmntAmtAndRsn/Amt",
    samples: ["150.00", "150", "150.5", "1,500.00", "1500,00", "-10.00", "0.001", "1234567890123456789.00", "+150.00", "1e3"],
    check: (v, ccy = "BRL") => {
      const lex = /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(v);
      const out: Facet[] = [f("xs:decimal lexical form", lex, lex ? "digits with an optional dot — no comma, no exponent, no thousands separator" : "not a decimal: use a dot, no commas or exponents")];
      if (!lex) return [...out, f("@Ccy = BRL", ccy === "BRL", `Ccy="${ccy}"`)];
      const [int, frac = ""] = v.replace(/^[+-]/, "").split(".");
      const fracSig = frac.replace(/0+$/, "");
      const digits = (int.replace(/^0+/, "") + fracSig).length;
      out.push(f("fractionDigits 2", fracSig.length <= 2, `${fracSig.length} significant fraction digit(s)`));
      if (frac.length > 2 && fracSig.length <= 2) out.push(f("trailing zeros", false, "equals a 2-decimal value, but validators disagree — never send more than 2 decimals", "warn"));
      out.push(f("totalDigits 18", digits <= 18, `${digits} significant digits`));
      out.push(f("minInclusive 0", !v.startsWith("-") || Number(v) === 0, "amounts are never negative; direction comes from the message, not the sign"));
      out.push(f("catalog: 2 decimals with a dot", frac.length === 2, frac.length === 2 ? "as the filling rule shows (e.g. 150.00)" : "XSD-valid, but the catalog asks for 2 decimals — send 150.00", "warn"));
      if (v.startsWith("+")) out.push(f("no sign", false, "a leading + is legal xs:decimal but pointless", "warn"));
      out.push(f("@Ccy = BRL", ccy === "BRL", `Ccy="${ccy}" — ActiveCurrencyCode is restricted to BRL`));
      return out;
    },
  },
  {
    id: "ISONormalisedDateTime",
    base: "xs:dateTime",
    decl: "pattern [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z",
    where: "CreDt, CreDtTm, AccptncDtTm, FctvIntrBkSttlmDt/DtTm",
    samples: ["2026-10-02T14:03:27.512Z", "2026-10-02T14:03:27Z", "2026-10-02T11:03:27.512-03:00", "2026-10-02 14:03:27.512Z", "2026-02-30T10:00:00.000Z", "2026-10-02T24:00:00.000Z"],
    check: (v) => {
      const pat = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(v);
      const out: Facet[] = [f("pattern …ss.sssZ", pat, pat ? "exactly milliseconds and a literal Z" : "needs YYYY-MM-DDThh:mm:ss.sssZ: 3-digit millis, UTC Z, no offset")];
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(v);
      if (m) {
        const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
        const okD = realDate(y, mo, d);
        const okT = h < 24 && mi < 60 && s < 60;
        out.push(f("xs:dateTime value", okD && okT, okD && okT ? "a real instant" : "not a real calendar date/time"));
      }
      if (/[+-]\d{2}:\d{2}$/.test(v)) out.push(f("UTC only", false, "offsets are not allowed: Brasília 11:03-03:00 must be sent as 14:03Z"));
      return out;
    },
  },
  {
    id: "ISODate",
    base: "xs:date",
    decl: "YYYY-MM-DD",
    where: "OrgnlTxRef/IntrBkSttlmDt, RptgPrd/FrToDt/FrDt",
    samples: ["2026-10-02", "2026-10-2", "02/10/2026", "2026-02-29", "2028-02-29"],
    check: (v) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      return [
        f("lexical YYYY-MM-DD", !!m, "two-digit month and day, dashes"),
        ...(m ? [f("real date", realDate(+m[1], +m[2], +m[3]), "leap years and month lengths apply")] : []),
      ];
    },
  },
  {
    id: "Max35Text",
    base: "xs:string",
    decl: "minLength 1 · maxLength 35",
    where: "MsgDefIdr, RjctgPtyRsn, EchoTxInf/Data",
    samples: ["pacs.008.spi.1.16", "", "a string that is definitely longer than thirty-five chars", " padded "],
    check: maxText(35),
  },
  {
    id: "Max140Text",
    base: "xs:string",
    decl: "minLength 1 · maxLength 140",
    where: "Dbtr/Nm, RmtInf/Ustrd",
    samples: ["Maria Ficticia Souza", "José da Conceição Müller", "Zoë ✓ Café 😀", "x".repeat(141)],
    check: maxText(140),
  },
  {
    id: "Max15Numeric",
    base: "xs:string",
    decl: "pattern [0-9]{1,15}",
    where: "GrpHdr/NbOfTxs",
    samples: ["1", "0", "01", "1234567890123456", "1.0"],
    check: (v) => {
      const ok = /^[0-9]{1,15}$/.test(v);
      return [
        f("pattern [0-9]{1,15}", ok, "a numeric string — not an integer type, so '01' is allowed"),
        ...(ok ? [f("catalog: ≥ 1", Number(v) >= 1, "NbOfTxs must be at least 1", "bad")] : []),
      ];
    },
  },
  {
    id: "ISPBType",
    base: "xs:string",
    decl: "pattern [0-9A-Z]{8} · maxLength 8",
    where: "Fr/To Id, DbtrAgt/CdtrAgt MmbId",
    samples: ["00038166", "12345678", "1234567", "0003816a", "AB12CD34"],
    check: (v) => [
      f("pattern [0-9A-Z]{8}", /^[0-9A-Z]{8}$/.test(v), "8 characters: digits or uppercase letters (letters anticipate the alphanumeric CNPJ root)"),
    ],
  },
  {
    id: "PICpfCnpj",
    base: "xs:string",
    decl: "pattern [0-9]{11}|[0-9A-Z]{12}[0-9]{2}",
    where: "Dbtr/Id/PrvtId/Othr/Id, Cdtr/…/Id",
    samples: ["12345678909", "11222333000181", "12ABC34501DE35", "123.456.789-09", "12345678900", "1122233300018"],
    check: (v) => {
      const pat = /^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$/.test(v);
      const out: Facet[] = [f("XSD pattern", pat, "11 digits (CPF) or 12 alphanumerics + 2 digits (CNPJ), no punctuation")];
      if (pat) {
        const isCpf = /^\d{11}$/.test(v);
        const ok = isCpf ? cpfOk(v) : cnpjOk(v);
        out.push(f(isCpf ? "CPF check digits" : "CNPJ check digits", ok, "not an XSD facet — the receiver PSP checks it (wrong owner → RJCT BE01)", "warn"));
      }
      return out;
    },
  },
  {
    id: "ExternalPurpose1Code",
    base: "xs:string enumeration",
    decl: "{GSCB, IPAY, IPRT, OTHR, REFU}",
    where: "Purp/Cd",
    samples: ["IPAY", "ipay", "GDDS", "REFU"],
    check: (v) => [f("enumeration", ["GSCB", "IPAY", "IPRT", "OTHR", "REFU"].includes(v), "case-sensitive; ISO's external list is much longer, the SPI XSD keeps 5")],
  },
];
