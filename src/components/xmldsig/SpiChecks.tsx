"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";

type Fault =
  | "ip"
  | "pathIspb"
  | "xsd"
  | "wrongKey"
  | "revoked"
  | "expiring"
  | "tampered"
  | "fromMismatch"
  | "notLiable";
type ClientCert = "pic" | "pia" | "expired" | "none";

const FAULTS: { id: Fault; label: string }[] = [
  { id: "ip", label: "source IP not registered in SPB-Web" },
  { id: "pathIspb", label: "POST /api/v1/in/{ispb} uses another ISPB" },
  { id: "xsd", label: "signature has 4 References (XSD allows exactly 3)" },
  { id: "wrongKey", label: "signed with the CERTPIC (connection) key" },
  { id: "revoked", label: "CERTPIA revoked by the CA" },
  { id: "expiring", label: "CERTPIA expires in less than 24 h" },
  { id: "tampered", label: "Document altered after signing" },
  { id: "fromMismatch", label: "AppHdr/Fr ISPB ≠ certificate's ISPB" },
  { id: "notLiable", label: "signer may not debit this Conta PI" },
];

type Stage = {
  id: string;
  where: string;
  label: string;
  detail: string;
  /** returns a failure description, or null if this stage passes */
  check: (f: Set<Fault>, c: ClientCert) => null | { why: string; outcome: "tcp" | "tls" | "http" | "admi" | "pacs002" };
};

const STAGES: Stage[] = [
  {
    id: "net",
    where: "RSFN",
    label: "Network: source IP allow-list",
    detail: "Only IPs pre-registered in the SPI module of SPB-Web may reach the ICOM (homologation and production).",
    check: (f) => (f.has("ip") ? { why: "connection from an unregistered address is refused", outcome: "tcp" } : null),
  },
  {
    id: "tls",
    where: "ICOM · TLS",
    label: "mTLS: client presents an active CERTPIC",
    detail: "TLS 1.2+, ECDHE-RSA-AES128-GCM-SHA256 at minimum. The client certificate must be an SPB-standard ICP-Brasil certificate registered for connection (CPIC).",
    check: (_f, c) =>
      c === "none"
        ? { why: "no client certificate: mutual authentication is mandatory", outcome: "tls" }
        : c === "pia"
          ? { why: "a signature certificate (CERTPIA) may not be used for the channel, and vice versa", outcome: "tls" }
          : c === "expired"
            ? { why: "certificate deactivated (automatic 24 h before expiry)", outcome: "tls" }
            : null,
  },
  {
    id: "http",
    where: "ICOM · HTTP",
    label: "POST /api/v1/in/{ispb}/msgs accepted",
    detail: "The ICOM stores the message and answers 201 + PI-ResourceId. No XSD or signature validation happens yet.",
    check: (f) => (f.has("pathIspb") ? { why: "request outside what this client may do", outcome: "http" } : null),
  },
  {
    id: "xsd",
    where: "SPI",
    label: "XSD validation (incl. xmldsig.spi.1.0.xsd)",
    detail: "Exactly 3 References, only the allowed algorithm URIs, KeyInfo with Id, X509IssuerSerial.",
    check: (f) => (f.has("xsd") ? { why: "Signature does not match the profile schema", outcome: "admi" } : null),
  },
  {
    id: "dig",
    where: "SPI",
    label: "Recompute the 3 digests",
    detail: "KeyInfo, AppHdr (minus ds:Signature), Document, each with exc-c14n + SHA-256.",
    check: (f) => (f.has("tampered") ? { why: "Document digest mismatch", outcome: "admi" } : null),
  },
  {
    id: "cert",
    where: "SPI",
    label: "KeyInfo → registered, active CERTPIA",
    detail: "Issuer + serial must match a certificate the participant registered for signature (CPIA via STA), currently active: not revoked, not within 24 h of expiry.",
    check: (f) =>
      f.has("revoked")
        ? { why: "certificate revoked (BC checks CRLs asynchronously and stops accepting it)", outcome: "admi" }
        : f.has("expiring")
          ? { why: "certificate already deactivated: 24 h before its notAfter", outcome: "admi" }
          : null,
  },
  {
    id: "rsa",
    where: "SPI",
    label: "RSA-SHA256 over c14n(SignedInfo)",
    detail: "Verify with the public key of the certificate found above.",
    check: (f) => (f.has("wrongKey") ? { why: "signature does not verify with the CERTPIA public key named in KeyInfo", outcome: "admi" } : null),
  },
  {
    id: "from",
    where: "SPI",
    label: "Sender consistency",
    detail: "The signer's certificate must belong to the ISPB in AppHdr/Fr (receiving a message with the wrong sender is one of the listed admi.002 cases).",
    check: (f) => (f.has("fromMismatch") ? { why: "sender in AppHdr/Fr does not match the signer", outcome: "admi" } : null),
  },
  {
    id: "biz",
    where: "SPI · settlement",
    label: "Business rules (pacs.008)",
    detail: "Now the payment itself: accounts, liquidity, limits. Failures here are pacs.002 RJCT, not admi.002.",
    check: (f) => (f.has("notLiable") ? { why: "signer is neither the holder of the debited Conta PI nor its settlement agent", outcome: "pacs002" } : null),
  },
];

const RSN: Record<string, string> = {
  xsd: "Assinatura invalida (XSD)",
  cert: "Certificado invalido",
  dig: "Assinatura invalida (digest)",
  rsa: "Assinatura invalida",
  from: "Remetente incorreto",
};

function admi002(stage: string, why: string) {
  return `<Envelope xmlns="https://www.bcb.gov.br/pi/admi.002/1.5">
  <AppHdr>
    <Fr><FIId><FinInstnId><Othr><Id>00038166</Id></Othr></FinInstnId></FIId></Fr>
    <To><FIId><FinInstnId><Othr><Id>99999010</Id></Othr></FinInstnId></FIId></To>
    <BizMsgIdr>M0003816620261002133013000000001</BizMsgIdr>
    <MsgDefIdr>admi.002.spi.1.5</MsgDefIdr>
    <CreDt>2026-10-02T13:30:13.120Z</CreDt>
    <Sgntr><!-- signed by the BC's own certificate --></Sgntr>
  </AppHdr>
  <Document>
    <admi.002.001.01>
      <RltdRef>
        <Ref>${stage === "xsd" ? "RUEkBcEPZ/0RXw6MnruFHGaLlc9V3j7IN" : "M9999901012345678901234567890123"}</Ref>
      </RltdRef>
      <Rsn>
        <RjctgPtyRsn>${RSN[stage] ?? "Erro"}</RjctgPtyRsn>
        <RjctnDtTm>2026-10-02T13:30:13.118Z</RjctnDtTm>
        <RsnDesc>${why}</RsnDesc>
      </Rsn>
    </admi.002.001.01>
  </Document>
</Envelope>`;
}

const PACS002 = `<FIToFIPmtStsRpt>
  <GrpHdr>…</GrpHdr>
  <TxInfAndSts>
    <OrgnlEndToEndId>E9999901020261002133012345678901</OrgnlEndToEndId>
    <TxSts>RJCT</TxSts>
    <StsRsnInf><Rsn><Cd>DS0G</Cd></Rsn></StsRsnInf>
  </TxInfAndSts>
</FIToFIPmtStsRpt>`;

export function SpiChecks() {
  const [faults, setFaults] = useState<Set<Fault>>(new Set(["tampered"]));
  const [cert, setCert] = useState<ClientCert>("pic");
  let stop: { i: number; why: string; outcome: "tcp" | "tls" | "http" | "admi" | "pacs002" } | null = null;
  for (let i = 0; i < STAGES.length && !stop; i++) {
    const r = STAGES[i].check(faults, cert);
    if (r) stop = { i, ...r };
  }
  const toggle = (f: Fault) =>
    setFaults((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  const stage = stop ? STAGES[stop.i] : null;

  return (
    <div className="space-y-4">
      <Controls>
        <span className="text-xs text-muted">client certificate in the TLS handshake</span>
        <Segmented
          value={cert}
          onChange={setCert}
          options={[
            { value: "pic", label: "CERTPIC (ok)" },
            { value: "pia", label: "CERTPIA" },
            { value: "expired", label: "expired" },
            { value: "none", label: "none" },
          ]}
        />
      </Controls>
      <div className="flex flex-wrap gap-2">
        {FAULTS.map((f) => (
          <label
            key={f.id}
            className={clsx(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition",
              faults.has(f.id) ? "border-bad/50 bg-bad/10 text-ink" : "border-line bg-panel-2 text-muted hover:text-ink",
            )}
          >
            <input type="checkbox" checked={faults.has(f.id)} onChange={() => toggle(f.id)} className="accent-red-400" />
            {f.label}
          </label>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Inbound pacs.008: what happens, in order">
          <ol className="space-y-1.5">
            {STAGES.map((s, i) => {
              const st = !stop || i < stop.i ? "ok" : i === stop.i ? "fail" : "skip";
              return (
                <li key={s.id} className={clsx("rounded-lg border px-2.5 py-1.5", st === "fail" ? "border-bad/50 bg-bad/10" : "border-line bg-panel-2/40", st === "skip" && "opacity-45")}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={clsx("size-2 shrink-0 rounded-full", st === "ok" ? "bg-ok" : st === "fail" ? "bg-bad" : "bg-line")} />
                    <span className="w-24 shrink-0 font-mono text-[10px] text-faint">{s.where}</span>
                    <span className="min-w-0 text-ink">{s.label}</span>
                  </div>
                  <div className={clsx("mt-0.5 pl-[8.25rem] text-[11px] max-sm:pl-4", st === "fail" ? "text-bad" : "text-faint")}>
                    {st === "fail" && stop ? stop.why : s.detail}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="result"
              value={!stop ? "settled" : stop.outcome === "tcp" ? "no connection" : stop.outcome === "tls" ? "TLS alert" : stop.outcome === "http" ? "HTTP 403" : stop.outcome === "admi" ? "admi.002" : "pacs.002 RJCT"}
              tone={!stop ? "good" : "bad"}
            />
            <Stat
              label="message stored?"
              value={!stop || stop.i >= 3 ? "yes (201)" : "no"}
              tone={!stop || stop.i >= 3 ? "neutral" : "warn"}
              hint={!stop || stop.i >= 3 ? "PI-ResourceId returned" : "nothing reached the ICOM queue"}
            />
          </div>
          <Panel title={!stop ? "SPI → receiver" : stop.outcome === "admi" ? "SPI → sender: admi.002" : stop.outcome === "pacs002" ? "SPI → sender: pacs.002" : "what the sender sees"}>
            {!stop ? (
              <p className="text-sm text-muted">All checks passed. The SPI settles and forwards the pacs.008 to the receiving PSP, re-signed with the BC&apos;s certificate. The receiver runs the same verification against its copy of the BC&apos;s certificates.</p>
            ) : stop.outcome === "admi" && stage ? (
              <>
                <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-[10.5px] leading-relaxed text-ink/90">{admi002(stage.id, stop.why)}</pre>
                <p className="mt-2 text-[11px] text-faint">
                  admi.002 has no code list: RjctgPtyRsn is free text (max 35 chars) and RltdRef carries the MsgId, or the PI-ResourceId when the
                  MsgId cannot be read. The reason texts here are illustrative, not the SPI&apos;s literal wording.
                </p>
              </>
            ) : stop.outcome === "pacs002" ? (
              <>
                <pre className="overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-[10.5px] leading-relaxed text-ink/90">{PACS002}</pre>
                <p className="mt-2 text-[11px] text-faint">DS0G (NotAllowedPayment): the participant that signed is not authorized to operate the debited Conta PI. The signature is valid; the signer is not allowed.</p>
              </>
            ) : stop.outcome === "http" ? (
              <pre className="overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-[10.5px] leading-relaxed text-ink/90">{`HTTP/1.1 403 Forbidden
Content-Type: application/problem+xml

<problem xmlns="urn:ietf:rfc:7807">
  <type>https://icom.pi.rsfn.net.br/api/v1/error/forbidden</type>
  <title>Acesso não permitido.</title>
</problem>`}</pre>
            ) : (
              <p className="text-sm text-muted">
                {stop.outcome === "tcp"
                  ? "The TCP connection never completes. No HTTP status, no admi.002: from the PSP side it looks like a network outage."
                  : "The handshake aborts with a TLS alert (e.g. bad_certificate / certificate_unknown). Nothing is sent, nothing is stored."}
              </p>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: with &quot;Document altered&quot; on, the message is accepted with 201 and only later bounced by an admi.002, because the ICOM
        stores first and validates afterwards. Pick CERTPIA as the TLS certificate: now nothing is stored at all. Uncheck everything except
        &quot;signer may not debit&quot;: the signature is fine and the rejection becomes a business one (pacs.002 DS0G).
      </p>
    </div>
  );
}
