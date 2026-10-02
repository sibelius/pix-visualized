export type ChapterKey =
  | "architecture"
  | "qrcode"
  | "dict"
  | "iso"
  | "spi"
  | "returns"
  | "contapi"
  | "icom"
  | "xmldsig"
  | "certs"
  | "api"
  | "automatico"
  | "med"
  | "beyond";

export const CHAPTER_COLOR: Record<ChapterKey, string> = {
  architecture: "#32bcad",
  qrcode: "#2dd4bf",
  dict: "#22d3ee",
  iso: "#818cf8",
  spi: "#a78bfa",
  returns: "#c084fc",
  contapi: "#e879f9",
  icom: "#f472b6",
  xmldsig: "#f5a524",
  certs: "#fb923c",
  api: "#a3e635",
  automatico: "#34d399",
  med: "#f87171",
  beyond: "#fbbf24",
};

export type NavItem = {
  href: string;
  label: string;
  blurb: string;
  n: string;
  group: string;
  chapter: ChapterKey | null;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", blurb: "The life of one Pix", n: "00", group: "Start", chapter: null },
  { href: "/architecture", label: "The architecture of Pix", blurb: "SPI, DICT, Conta PI, participants", n: "01", group: "I · The rails", chapter: "architecture" },
  { href: "/qrcode", label: "QR codes & BR Code", blurb: "EMV TLV, CRC16, static vs dynamic", n: "02", group: "I · The rails", chapter: "qrcode" },
  { href: "/dict", label: "DICT: the key directory", blurb: "Keys, lookups, claims, rate limits", n: "03", group: "I · The rails", chapter: "dict" },
  { href: "/iso20022", label: "ISO 20022 anatomy", blurb: "AppHdr, MsgId, EndToEndId, catalog", n: "04", group: "II · Settlement (SPI)", chapter: "iso" },
  { href: "/pacs008", label: "Payment: pacs.008 → pacs.002", blurb: "Credit transfer, status, timeouts", n: "05", group: "II · Settlement (SPI)", chapter: "spi" },
  { href: "/pacs004", label: "Returns: pacs.004", blurb: "Devolução, reasons, partial refunds", n: "06", group: "II · Settlement (SPI)", chapter: "returns" },
  { href: "/conta-pi", label: "Conta PI & statements", blurb: "Liquidity, STR, camt.052/053/054", n: "07", group: "II · Settlement (SPI)", chapter: "contapi" },
  { href: "/icom", label: "ICOM: talking to the SPI", blurb: "HTTP long-poll, multipart, gzip", n: "08", group: "II · Settlement (SPI)", chapter: "icom" },
  { href: "/xmldsig", label: "XMLDSig signatures", blurb: "c14n, digest, RSA-SHA256, verify", n: "09", group: "III · Security", chapter: "xmldsig" },
  { href: "/certificates", label: "RSFN & certificates", blurb: "ICP-Brasil, CertPIC/CertPIA, mTLS", n: "10", group: "III · Security", chapter: "certs" },
  { href: "/api-pix", label: "The API Pix", blurb: "cob, cobv, loc, webhooks, JWS", n: "11", group: "IV · Products", chapter: "api" },
  { href: "/automatico", label: "Pix Automático", blurb: "Recurring authorizations, retries", n: "12", group: "IV · Products", chapter: "automatico" },
  { href: "/med", label: "MED & anti-fraud", blurb: "Infractions, blocks, refunds", n: "13", group: "IV · Products", chapter: "med" },
  { href: "/beyond", label: "Beyond the basic Pix", blurb: "Saque/Troco, NFC, JSR, limits, SLAs", n: "14", group: "IV · Products", chapter: "beyond" },
  { href: "/glossary", label: "Glossary", blurb: "Every concept, searchable", n: "15", group: "Reference", chapter: null },
];
