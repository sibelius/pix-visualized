"use client";

import { useState } from "react";
import clsx from "clsx";
import { Panel, Segmented } from "@/components/ui";

/**
 * STR0008 (TED client-to-client in the STR, the BCB's RTGS) vs pacs.008 in the SPI. The STR0008 layout is
 * abridged and illustrative — tag names follow the SPB catalog style (Catálogo de Serviços do SFN, volumes I–IV);
 * check the current catalog for the exact, complete layout.
 */
type Pair = { id: string; concept: string; str: string; strVal: string; iso: string; isoVal: string; note?: string };

const PAIRS: Pair[] = [
  { id: "code", concept: "which message", str: "CodMsg", strVal: "STR0008", iso: "AppHdr/MsgDefIdr", isoVal: "pacs.008.spi.1.16", note: "Flat code vs. a versioned ISO definition." },
  { id: "from", concept: "sender", str: "BCMSG/IdentdEmissor", strVal: "12345678", iso: "AppHdr/Fr/FIId/FinInstnId/Othr/Id", isoVal: "12345678", note: "Both use the ISPB." },
  { id: "to", concept: "recipient", str: "BCMSG/IdentdDestinatario", strVal: "00038166", iso: "AppHdr/To/…/Othr/Id", isoVal: "00038166", note: "Same BCB ISPB on both rails." },
  { id: "op", concept: "message / operation id", str: "BCMSG/NUOp · NumCtrlIF", strVal: "1234567820261002000001", iso: "GrpHdr/MsgId · PmtId/EndToEndId", isoVal: "M12345678… · E12345678…", note: "SPB separates the transport operation number (NUOp) from the bank's control number; ISO separates MsgId (message) from EndToEndId (payment)." },
  { id: "dbtrAgt", concept: "payer's bank", str: "ISPBIFDebtd", strVal: "12345678", iso: "DbtrAgt/FinInstnId/ClrSysMmbId/MmbId", isoVal: "12345678" },
  { id: "dbtrAcct", concept: "payer's account", str: "AgDebtd · TpCtDebtd · CtDebtd", strVal: "0001 · CC · 12345", iso: "DbtrAcct/Id/Othr/{Issr,Id} · Tp/Cd", isoVal: "0001 · 0012345 · CACC", note: "Two-letter account types (CC, PP…) become ISO codes (CACC, SVGS, TRAN…)." },
  { id: "dbtr", concept: "payer", str: "TpPessoaDebtd · CNPJ_CPFCliDebtd · NomCliDebtd", strVal: "F · 12345678909 · MARIA…", iso: "Dbtr/Nm · Dbtr/Id/PrvtId/Othr/Id", isoVal: "Maria… · 12345678909", note: "SPB says F/J explicitly; the SPI infers it from 11 vs 14 characters." },
  { id: "cdtrAgt", concept: "payee's bank", str: "ISPBIFCredtd", strVal: "87654321", iso: "CdtrAgt/…/MmbId", isoVal: "87654321" },
  { id: "cdtr", concept: "payee", str: "AgCredtd · CtCredtd · CNPJ_CPFCliCredtd · NomCliCredtd", strVal: "0001 · 998877 · 112… · LOJA…", iso: "CdtrAcct/… · Cdtr/Id/…/Id (no name)", isoVal: "99887766 · 11222333000181", note: "Pix carries no payee name; it may carry the Pix key (CdtrAcct/Prxy)." },
  { id: "amt", concept: "amount", str: "VlrLanc", strVal: "150.00", iso: "IntrBkSttlmAmt @Ccy", isoVal: "150.00 BRL", note: "Currency becomes explicit." },
  { id: "purp", concept: "purpose", str: "FinlddCli", strVal: "10", iso: "Purp/Cd", isoVal: "IPAY", note: "Numeric domain table vs. ISO external code list." },
  { id: "date", concept: "date", str: "DtMovto", strVal: "2026-10-02", iso: "AccptncDtTm · CreDtTm", isoVal: "2026-10-02T14:03:26.871Z", note: "A business date (movement day) vs. millisecond UTC instants: the SPI has no business day." },
];

const STR_XML = (hl: string | null) => [
  { t: "<DOC>", id: "" },
  { t: "  <BCMSG>", id: "" },
  { t: "    <IdentdEmissor>12345678</IdentdEmissor>", id: "from" },
  { t: "    <IdentdDestinatario>00038166</IdentdDestinatario>", id: "to" },
  { t: "    <DomSist>SPB01</DomSist>", id: "" },
  { t: "    <NUOp>1234567820261002000001</NUOp>", id: "op" },
  { t: "  </BCMSG>", id: "" },
  { t: "  <SISMSG>", id: "" },
  { t: "    <STR0008>", id: "" },
  { t: "      <CodMsg>STR0008</CodMsg>", id: "code" },
  { t: "      <NumCtrlIF>TED20261002000001</NumCtrlIF>", id: "op" },
  { t: "      <ISPBIFDebtd>12345678</ISPBIFDebtd>", id: "dbtrAgt" },
  { t: "      <AgDebtd>0001</AgDebtd>", id: "dbtrAcct" },
  { t: "      <TpCtDebtd>CC</TpCtDebtd>", id: "dbtrAcct" },
  { t: "      <CtDebtd>12345</CtDebtd>", id: "dbtrAcct" },
  { t: "      <TpPessoaDebtd>F</TpPessoaDebtd>", id: "dbtr" },
  { t: "      <CNPJ_CPFCliDebtd>12345678909</CNPJ_CPFCliDebtd>", id: "dbtr" },
  { t: "      <NomCliDebtd>MARIA FICTICIA SOUZA</NomCliDebtd>", id: "dbtr" },
  { t: "      <ISPBIFCredtd>87654321</ISPBIFCredtd>", id: "cdtrAgt" },
  { t: "      <AgCredtd>0001</AgCredtd>", id: "cdtr" },
  { t: "      <CtCredtd>998877</CtCredtd>", id: "cdtr" },
  { t: "      <CNPJ_CPFCliCredtd>11222333000181</CNPJ_CPFCliCredtd>", id: "cdtr" },
  { t: "      <NomCliCredtd>LOJA EXEMPLO LTDA</NomCliCredtd>", id: "cdtr" },
  { t: "      <VlrLanc>150.00</VlrLanc>", id: "amt" },
  { t: "      <FinlddCli>10</FinlddCli>", id: "purp" },
  { t: "      <DtMovto>2026-10-02</DtMovto>", id: "date" },
  { t: "    </STR0008>", id: "" },
  { t: "  </SISMSG>", id: "" },
  { t: "</DOC>", id: "" },
].map((l) => ({ ...l, on: hl !== null && l.id === hl }));

const CONTRAST: [string, string, string][] = [
  ["standard", "BCB proprietary (Catálogo do SFN, vols. I–IV)", "ISO 20022 subset, restricted by SPI XSDs (vol. VI)"],
  ["naming", "group + event: STR0008, STR0008R1, STR0008R2", "area.message.spi.major.minor"],
  ["encoding", "UTF-16 BE (domain SPB01)", "UTF-8"],
  ["transport", "RSFN message queues (MQ) with a security header", "HTTPS/1.1 + mutual TLS 1.2 to the ICOM, over the RSFN"],
  ["structure", "flat: one tag per field, prefixes encode role (…Debtd / …Credtd)", "nested, reusable components (Dbtr, DbtrAcct, DbtrAgt)"],
  ["clock", "business day (DtMovto) and operating windows", "24/7/365, UTC milliseconds, no business day"],
  ["settlement", "STR: gross, real time, during STR hours", "SPI: gross, real time, any second — in the Conta PI"],
];

export function LegacyCompare() {
  const [hl, setHl] = useState<string | null>("op");
  const [view, setView] = useState<"map" | "contrast">("map");
  const lines = STR_XML(hl);
  return (
    <div className="space-y-4">
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "map", label: "Field map: STR0008 ↔ pacs.008" },
          { value: "contrast", label: "Rail vs rail" },
        ]}
      />
      {view === "map" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Panel title="STR0008 · TED (abridged, illustrative)" bodyClassName="p-0">
            <div className="overflow-x-auto py-2 font-mono text-[11px] leading-[1.6]">
              {lines.map((l, i) => (
                <div
                  key={i}
                  onMouseEnter={() => l.id && setHl(l.id)}
                  className={clsx("whitespace-pre px-3", l.on ? "bg-warn/15 text-warn" : l.id ? "cursor-pointer text-muted hover:bg-panel-2" : "text-faint")}
                >
                  {l.t}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Same concept in pacs.008" bodyClassName="p-0">
            <ul className="divide-y divide-line text-xs">
              {PAIRS.map((p) => (
                <li
                  key={p.id}
                  onMouseEnter={() => setHl(p.id)}
                  className={clsx("cursor-pointer px-3 py-1.5", hl === p.id ? "bg-[#818cf8]/15" : "hover:bg-panel-2")}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-ink">{p.concept}</span>
                    <span className="font-mono text-[10.5px] text-[#a5b4fc]">{p.iso}</span>
                  </div>
                  {hl === p.id && p.note && <div className="mt-0.5 text-muted">{p.note}</div>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : (
        <Panel title="STR (TED) vs SPI (Pix)" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-faint">
                <tr>
                  <th className="px-3 py-2 font-normal" />
                  <th className="px-3 py-2 font-normal">SPB / STR proprietary XML</th>
                  <th className="px-3 py-2 font-normal">SPI ISO 20022</th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST.map(([k, a, b]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="px-3 py-1.5 font-mono text-faint">{k}</td>
                    <td className="px-3 py-1.5 text-muted">{a}</td>
                    <td className="px-3 py-1.5 text-ink">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <p className="text-xs text-faint">
        Try: hover <span className="font-mono">NUOp</span> / <span className="font-mono">NumCtrlIF</span> — the SPB already split &quot;this
        transmission&quot; from &quot;this business operation&quot;, the same split ISO makes with MsgId and EndToEndId. Then hover the payee:
        TED carries the payee&apos;s name; Pix does not.
      </p>
    </div>
  );
}
