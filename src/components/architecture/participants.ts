/**
 * Participation rules: Regulamento Pix (Resolução BCB nº 1/2020, art. 3º and art. 23, as amended up to
 * Res. BCB nº 587/2026) and Regulamento do SPI (Resolução BCB nº 195/2022, art. 14). Counts come from the
 * BCB list "lista-participantes-instituicoes-em-adesao-pix-20261001.csv" (snapshot of 2026-10-01).
 */

export type Modality = "pct" | "iniciador" | "liquidante" | "governo" | "usuaria";
export type InstType = "banco" | "coop" | "ip" | "ipNa" | "scd" | "stn";
export type SpiMode = "direct" | "indirect" | "none";

export const MODALITIES: Record<Modality, { label: string; pt: string; what: string }> = {
  pct: {
    label: "Account provider",
    pt: "provedor de conta transacional",
    what: "Offers deposit or prepaid payment accounts to end users and sends/receives Pix for them. 862 of the 883 active participants.",
  },
  iniciador: {
    label: "Payment initiator (ITP)",
    pt: "iniciador",
    what: "Holds no customer accounts and no Conta PI. It initiates a Pix at the payer's account provider through Open Finance; its CNPJ root can be the EndToEndId prefix and it appears in pacs.008 InitgPty.",
  },
  liquidante: {
    label: "Special settler",
    pt: "liquidante especial",
    what: "Exists only to settle in the SPI for other participants; does not offer Pix to end users (it may also act as initiator since Res. 403/2024).",
  },
  governo: {
    label: "Government entity",
    pt: "ente governamental",
    what: "Only the Secretaria do Tesouro Nacional (STN, ISPB 00394460), for collections and payments of its own activities.",
  },
  usuaria: {
    label: "User institution",
    pt: "instituição usuária",
    what: "Added by Res. 403/2024: a financial or payment institution that uses Pix only for its own receivables and payables, with no end-user offer.",
  },
};

export const INST_TYPES: Record<InstType, { label: string; forced?: SpiMode; note?: string }> = {
  banco: { label: "Commercial / multiple bank", forced: "direct", note: "commercial banks, multiple banks with a commercial portfolio and caixas econômicas must be direct" },
  coop: { label: "Credit cooperative" },
  ip: { label: "Payment institution (authorized)" },
  ipNa: { label: "Payment institution (not BCB-authorized)", forced: "indirect", note: "institutions not authorized by the BCB can only be indirect, and need a contract with a responsible participant" },
  scd: { label: "SCD / SCFI / DTVM" },
  stn: { label: "Tesouro Nacional (STN)", forced: "direct" },
};

export type Config = { modality: Modality; inst: InstType; spi: SpiMode; dictDirect: boolean; accounts: number };

export function allowedSpi(c: Pick<Config, "modality" | "inst">): SpiMode[] {
  if (c.modality === "iniciador") return ["none"];
  if (c.modality === "liquidante" || c.modality === "governo") return ["direct"];
  const f = INST_TYPES[c.inst].forced;
  return f ? [f] : ["direct", "indirect"];
}

/** Res. BCB nº 1/2020 art. 3º: mandatory for authorized FIs and IPs with more than 500,000 active accounts. */
export function mandatory(c: Config) {
  return c.inst !== "ipNa" && c.inst !== "stn" && c.modality === "pct" && c.accounts > 500_000;
}

/** 2026-10-01 snapshot of the BCB participant list (883 active, 19 joining). */
export const SNAPSHOT = {
  date: "2026-10-01",
  active: 883,
  joining: 19,
  spi: { direct: 218, indirect: 648, none: 17 },
  pix: { mandatory: 39, optional: 844 },
  modality: { pct: 862, iniciador: 18, liquidante: 2, governo: 1 },
  initiationService: 81,
  byType: [
    { label: "Credit cooperatives", direct: 19, indirect: 539, none: 0 },
    { label: "Payment institutions (authorized)", direct: 61, indirect: 66, none: 17 },
    { label: "Payment institutions (not BCB-authorized)", direct: 0, indirect: 26, none: 0 },
    { label: "Banks (multiple, commercial, CEF, FX)", direct: 67, indirect: 0, none: 0 },
    { label: "SCD (direct credit companies)", direct: 39, indirect: 11, none: 0 },
    { label: "Others (SCFI, DTVM, CTVM, SCMEPP, SEP, STN…)", direct: 32, indirect: 6, none: 0 },
  ],
};

/** ISPB = the 8-character root of the CNPJ (alphanumeric roots allowed since the alphanumeric CNPJ). */
export function ispbFromCnpj(raw: string) {
  const c = raw.toUpperCase().replace(/[./-]/g, "");
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return null;
  return c.slice(0, 8);
}
