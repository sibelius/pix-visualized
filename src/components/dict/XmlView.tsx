"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";

const TAG = /(<\?[^>]*\?>|<!--[\s\S]*?-->)|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
const ATTR = /([\w:.-]+)="([^"]*)"/g;

function Attrs({ s }: { s: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(
      <span key={m.index}>
        <span className="text-[#c4b5fd]">{m[1]}</span>
        <span className="text-faint">=</span>
        <span className="text-[#fcd34d]">&quot;{m[2]}&quot;</span>
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
}

function Line({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  let i = 0;
  while ((m = TAG.exec(text))) {
    if (m[1] !== undefined) {
      out.push(
        <span key={i++} className="text-faint">
          {m[1]}
        </span>,
      );
    } else if (m[6] !== undefined) {
      out.push(
        <span key={i++} className="text-ink">
          {m[6]}
        </span>,
      );
    } else {
      out.push(
        <span key={i++}>
          <span className="text-faint">&lt;{m[2]}</span>
          <span className="text-[#67e8f9]">{m[3]}</span>
          {m[4] && <Attrs s={m[4]} />}
          <span className="text-faint">
            {m[5]}&gt;
          </span>
        </span>,
      );
    }
  }
  return <>{out}</>;
}

const tagOf = (line: string) => line.match(/<\/?([A-Za-z][\w:.-]*)/)?.[1] ?? null;

/**
 * A small XML viewer: syntax colored, hover any line to read what that field
 * means (from `docs`, keyed by element name). `highlight` marks element names
 * that changed or matter in the current state.
 */
export function XmlView({
  xml,
  docs = {},
  highlight = [],
  maxHeight = 420,
  className,
  hint = "hover a field to see what it means",
}: {
  xml: string;
  docs?: Record<string, string>;
  highlight?: string[];
  maxHeight?: number;
  className?: string;
  hint?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const lines = xml.replace(/\n+$/, "").split("\n");
  return (
    <div className={clsx("min-w-0 rounded-lg border border-line bg-bg", className)}>
      <pre data-export-language="xml" className="overflow-auto p-3 font-mono text-[11.5px] leading-[1.55]" style={{ maxHeight }}>
        {lines.map((ln, idx) => {
          const tag = tagOf(ln);
          const has = tag ? docs[tag] !== undefined : false;
          const hl = tag ? highlight.includes(tag) : false;
          return (
            <div
              key={idx}
              onMouseEnter={() => has && setActive(tag)}
              className={clsx(
                "-mx-3 px-3 whitespace-pre",
                has && "cursor-help",
                active && tag === active && "bg-panel-2",
                hl && "bg-accent/10 shadow-[inset_2px_0_0_#32bcad]",
              )}
            >
              <Line text={ln} />
            </div>
          );
        })}
      </pre>
      <div className="min-h-[2.5rem] border-t border-line px-3 py-2 text-xs leading-relaxed text-muted">
        {active && docs[active] ? (
          <>
            <span className="font-mono text-[#67e8f9]">{active}</span> · {docs[active]}
          </>
        ) : (
          <span data-export-ignore="" className="text-faint">{hint}</span>
        )}
      </div>
    </div>
  );
}

/** Docs for the elements that show up in DICT payloads (used by both DICT and MED chapters). */
export const DICT_DOCS: Record<string, string> = {
  GetEntryResponse: "Response to GET /entries/{Key}. Signed by the DICT with XMLDSig; the PSP must validate the signature.",
  Signature: "Enveloped XMLDSig signature. Reads need no signature on the request; every response is signed.",
  ResponseTime: "When the DICT produced the response (UTC, ms precision).",
  CorrelationId: "DICT-side id for support tickets. Log it.",
  Entry: "The vínculo: key ↔ transactional account ↔ owner.",
  Key: "The Pix key exactly as stored (normalized: digits only, lowercase e-mail, E.164 phone, lowercase UUID).",
  KeyType: "CPF | CNPJ | PHONE | EMAIL | EVP. New types may appear: clients must not break on unknown values.",
  Account: "The receiver's transactional account, used to build CdtrAcct in the pacs.008.",
  Participant: "ISPB (8 chars) of the PSP that holds the account / sends the request.",
  Branch: "Agência, up to 4 digits, no check digit. Absent for accounts without branch.",
  AccountNumber: "Account number including its check digit (a letter check digit becomes 0). Up to 20 alphanumerics.",
  AccountType: "ISO 20022 code: CACC (checking), SVGS (savings), SLRY (salary), TRAN (payment account), OTHR.",
  OpeningDate: "Account opening date. A days-old account is a classic mule signal.",
  Owner: "The key holder: NATURAL_PERSON (CPF) or LEGAL_PERSON (CNPJ).",
  Type: "NATURAL_PERSON | LEGAL_PERSON (or claim type, depending on the parent element).",
  TaxIdNumber: "CPF (11 digits) or CNPJ (14 chars). Must be masked before showing to the payer.",
  Name: "Civil (or registered social) name / razão social, as in Receita Federal, max 150 chars.",
  TradeName: "Nome fantasia, only if it is in the CNPJ registration. Empty for MEI.",
  CreationDate: "When the key was first registered in the DICT.",
  KeyOwnershipDate: "When the current owner took the key. A key that changed hands yesterday deserves suspicion.",
  OpenClaimCreationDate: "Present only while a portability or ownership claim is open for this key.",
  OwnerStatistics: "Anti-fraud counters for the owner's CPF/CNPJ (returned with IncludeStatistics=true).",
  KeyStatistics: "Anti-fraud counters for this specific key.",
  Spi: "Counters derived from SPI settlements.",
  Settlements: "Settlements as receiver in the SPI, per window (d90 / m12 / m60).",
  FraudMarkers: "Counts of fraud markers by type, per window.",
  ApplicationFrauds: "Markers of type APPLICATION_FRAUD (falsidade ideológica: account opened with stolen identity).",
  MuleAccounts: "Markers of type MULE_ACCOUNT (conta laranja: account used to move stolen money).",
  ScammerAccounts: "Markers of type SCAMMER_ACCOUNT (the fraudster's own account).",
  OtherFrauds: "Markers of type OTHER.",
  UnknownFrauds: "Markers inherited from API v1, which had no fraud type.",
  TotalFraudTransactionAmount: "Sum (integer part) of SPI transactions tied to markers, excluding UNKNOWN.",
  DistinctFraudReporters: "How many different PSPs marked this key/person. Many independent reporters ≫ one angry PSP.",
  InfractionReports: "Infraction reports (notificações de infração) involving this key/person.",
  OpenReports: "Reports not yet closed or cancelled, right now.",
  OpenReportsDistinctReporters: "Distinct PSPs behind the open reports.",
  RejectedReports: "Reports closed with DISAGREED, per window.",
  Entries: "Registration footprint.",
  RegisteredAccounts: "Accounts of this CPF/CNPJ with Pix keys.",
  DistinctAccounts: "Distinct accounts this key has pointed to, per window. A key hopping between accounts is a red flag.",
  Watermark: "Timestamp of the last event included. Statistics lag events by up to 12 h.",
  problem: "RFC 7807 problem details, as application/problem+xml.",
  type: "Error type URI: https://dict.pi.rsfn.net.br/api/v2/error/<TipoErro>.",
  title: "Short human-readable error title.",
  status: "HTTP status repeated in the body.",
  detail: "Human-readable detail.",
};
