"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";

type Profile = "pic" | "pia" | "bc" | "qrc";
type Fault =
  | "expired"
  | "last24h"
  | "revoked"
  | "untrusted"
  | "rsa1024"
  | "e3"
  | "homolog"
  | "wrongPurpose"
  | "notRegistered"
  | "wrongCN"
  | "wildcard"
  | "notEV"
  | "noServerAuth"
  | "revUnknown";

/** the page's "now", fixed so server and client render the same */
const NOW = "2026-10-02 13:30 UTC";

type Field = [string, string];
type Cert = { title: string; role: string; fields: Field[] };

function chain(p: Profile, f: Set<Fault>): Cert[] {
  const notAfter = f.has("expired") ? "2026-09-30 23:59:59 UTC" : f.has("last24h") ? "2026-10-03 09:00:00 UTC" : "2027-03-01 12:00:00 UTC";
  const key = f.has("rsa1024") ? "RSA 1024 bits" : "RSA 2048 bits";
  const exp = f.has("e3") ? "3" : "65537 (0x10001)";
  if (p === "pic" || p === "pia") {
    const env = f.has("homolog") ? "T" : "P";
    return [
      {
        title: f.has("untrusted") ? "CN=Minha AC Interna (self-signed)" : "AC Raiz Brasileira (ICP-Brasil)",
        role: "trust anchor",
        fields: f.has("untrusted")
          ? [
              ["Subject", "CN=Minha AC Interna, O=PSP Exemplo"],
              ["Issuer", "itself"],
              ["Note", "not an ICP-Brasil root"],
            ]
          : [
              ["Subject", "CN=Autoridade Certificadora Raiz Brasileira v5, OU=Instituto Nacional de Tecnologia da Informacao - ITI, O=ICP-Brasil, C=BR"],
              ["Issuer", "itself (self-signed root)"],
              ["Key", "RSA 4096"],
              ["Note", "the chain version (v5, v10…) depends on your CA; check its published chain"],
            ],
      },
      {
        title: "AC Exemplo SPB",
        role: "SPB-standard issuing CA",
        fields: [
          ["Subject", "CN=AC Exemplo SPB, OU=CSPB-0, O=ICP-Brasil, C=BR"],
          ["Issuer", f.has("untrusted") ? "CN=Minha AC Interna" : "CN=Autoridade Certificadora Raiz Brasileira v5 (often via a 1st-level AC)"],
          ["OU=CSPB-n", "code the BCB assigns to each SPB CA (1 Serpro, 2 Certisign, 4 Serasa, 5 CAIXA, 6 Valid, 7 Soluti)"],
          ["CRL", "published hourly, SPB certificates only"],
        ],
      },
      {
        title: `PSP Exemplo S.A. ${env}001`,
        role: p === "pic" ? "end entity · registered as CERTPIC (CPIC)" : "end entity · registered as CERTPIA (CPIA)",
        fields: [
          ["Subject", `C=BR, O=ICP-Brasil, OU=ISPB-99999010, OU=SISBACEN-12345, CN=PSP Exemplo S.A. ${env}001`],
          ["Issuer", "CN=AC Exemplo SPB, OU=CSPB-0, O=ICP-Brasil, C=BR"],
          ["Serial", "20260130224837516000"],
          ["Validity", `2026-03-01 12:00:00 UTC → ${notAfter}`],
          ["Public key", `${key}, e = ${exp}`],
          ["Policy OID", "2.16.76.1.2.1.n (ICP-Brasil A1)"],
          ["Key Usage", p === "pia" ? "digitalSignature, nonRepudiation (dataEncipherment off)" : "digitalSignature, keyEncipherment"],
          ["Ext. Key Usage", "clientAuth (typical; depends on the CA's PC)"],
          ["CN letter", `${env} = ${env === "P" ? "production" : "homologation (test)"}`],
        ],
      },
    ];
  }
  if (p === "bc")
    return [
      {
        title: f.has("untrusted") ? "CN=Some Other Root" : "AC Raiz Brasileira v10",
        role: "trust anchor",
        fields: [
          ["Subject", f.has("untrusted") ? "CN=Some Other Root" : "CN=Autoridade Certificadora Raiz Brasileira v10, O=ICP-Brasil, C=BR"],
          ["Note", "the ICP-Brasil SSL chain (acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt)"],
        ],
      },
      { title: "AC SSL intermediate (v10 chain)", role: "issuing CA", fields: [["Subject", "CN=AC Exemplo SSL v10, O=ICP-Brasil, C=BR"]] },
      {
        title: f.has("wrongCN") ? "CN=icom.attacker.example" : "CN=*.pi.rsfn.net.br",
        role: "BCB server certificate",
        fields: [
          ["Subject", f.has("wrongCN") ? "CN=icom.attacker.example" : "CN=*.pi.rsfn.net.br, O=Banco Central do Brasil, C=BR"],
          ["Validity", `2026-01-10 → ${notAfter}`],
          ["Public key", key],
          ["Ext. Key Usage", "serverAuth"],
          ["Note", "the BC may have several active at once and roll them site by site"],
        ],
      },
    ];
  return [
    { title: f.has("untrusted") ? "CN=Unknown Root" : "Public root CA", role: "trust anchor (browser/OS store)", fields: [["Note", "CA/Browser Forum compliant CA; not ICP-Brasil SPB"]] },
    { title: "Public EV issuing CA", role: "issuing CA", fields: [["Policy", f.has("notEV") ? "DV (domain validated)" : "EV (2.23.140.1.1)"]] },
    {
      title: f.has("wildcard") ? "CN=*.psp-b.com.br" : "CN=pix.psp-b.com.br",
      role: "end entity · registered as CERTQRC (CQRC)",
      fields: [
        ["Subject", f.has("wildcard") ? "CN=*.psp-b.com.br" : "CN=pix.psp-b.com.br, O=PSP B S.A., serialNumber=…, jurisdictionC=BR"],
        ["SAN", f.has("wildcard") ? "*.psp-b.com.br" : "pix.psp-b.com.br"],
        ["Validity", `2026-05-01 → ${notAfter}`],
        ["Ext. Key Usage", f.has("noServerAuth") ? "clientAuth" : "serverAuth"],
        ["Public key", key],
      ],
    },
  ];
}

type Check = { label: string; fail: (f: Set<Fault>) => string | null; note: string };

const SPB_CHECKS = (p: "pic" | "pia"): Check[] => [
  { label: "Chain builds to a trusted ICP-Brasil root", fail: (f) => (f.has("untrusted") ? "issuer chain ends at an untrusted, non-ICP-Brasil root" : null), note: "RFC 5280 path validation: each signature verified with the issuer's key." },
  { label: "Within validity", fail: (f) => (f.has("expired") ? "notAfter is in the past" : f.has("last24h") ? "less than 24 h to notAfter: Pix auto-deactivates every certificate 24 h before expiry" : null), note: `now = ${NOW}; usable until notAfter − 24 h.` },
  { label: "Not revoked", fail: (f) => (f.has("revoked") ? "serial is on the CA's CRL; the BC (checking asynchronously) stops accepting transactions from/to the participant" : null), note: "Checked asynchronously by the BC from the CAs' CRLs: Pix systems have no internet path to CRL/OCSP." },
  { label: "Key policy", fail: (f) => (f.has("rsa1024") ? "only RSA-2048 keys are accepted" : f.has("e3") ? "public exponent 3 is forbidden" : null), note: "RSA 2048, e ≠ 3, modulus MSB = 1, a fresh key pair never used in any other certificate." },
  { label: "SPB subject and environment", fail: (f) => (f.has("homolog") ? "CN ends in T001: a homologation certificate, and its key may not be used in production" : null), note: "C=BR, O=ICP-Brasil, OU=ISPB-xxxxxxxx, OU=SISBACEN-xxxxx, CN=<name> P|T nnn." },
  { label: `Registered and active as ${p === "pic" ? "CERTPIC" : "CERTPIA"} for this ISPB`, fail: (f) => (f.has("notRegistered") ? "never uploaded via STA, or still within the BC's 7-day activation window" : null), note: "Uploaded as PEM via STA (code CPIC / CPIA), accepted with 'Certificado digital aceito e ativado'." },
  {
    label: p === "pic" ? "Used for the channel (TLS client auth)" : "Used for message signatures",
    fail: (f) => (f.has("wrongPurpose") ? (p === "pic" ? "a CERTPIC key was used to sign messages" : "a CERTPIA was presented in the TLS handshake") : null),
    note: "Connection and signature certificates are separate and exclusive to Pix (not SPB/STR, not MES).",
  },
];

const BC_CHECKS: Check[] = [
  { label: "Issued under the ICP-Brasil v10 chain", fail: (f) => (f.has("untrusted") ? "not chained to AC Raiz Brasileira v10: possible interception, abort" : null), note: "The BC uses SSL certificates of the v10 chain for its endpoints." },
  { label: "*.pi.rsfn.net.br in the CN", fail: (f) => (f.has("wrongCN") ? "CN does not cover the Pix host name" : null), note: "icom.pi.rsfn.net.br, dict.pi.rsfn.net.br, arq.pi.rsfn.net.br…" },
  { label: "Not expired", fail: (f) => (f.has("expired") ? "server certificate expired" : null), note: `now = ${NOW}` },
  {
    label: "Not revoked",
    fail: (f) => (f.has("revoked") ? "revoked: reject the connection and notify DEINF via BC Correio" : null),
    note: "If revocation status cannot be checked, notify DEINF but keep accepting (unlike QR certificates).",
  },
];

const QRC_CHECKS: Check[] = [
  { label: "Chain to a widely trusted public CA", fail: (f) => (f.has("untrusted") ? "unknown root" : null), note: "CA/Browser Forum compliant." },
  { label: "EV certificate", fail: (f) => (f.has("notEV") ? "only Extended Validation certificates are allowed for QR sites" : null), note: "" },
  { label: "Host in CN/SAN, no wildcard", fail: (f) => (f.has("wildcard") ? "wildcard certificates (*.psp-b.com.br) are not accepted" : null), note: "Production hosts must not end in -h; homologation hosts must." },
  { label: "EKU serverAuth", fail: (f) => (f.has("noServerAuth") ? "Extended Key Usage lacks Server Authentication" : null), note: "" },
  { label: "Within validity", fail: (f) => (f.has("expired") ? "expired" : null), note: `now = ${NOW}` },
  {
    label: "Revocation verified",
    fail: (f) => (f.has("revoked") ? "revoked: reject the QR transaction" : f.has("revUnknown") ? "status could not be verified: a QR transaction must be rejected in this case" : null),
    note: "The payer's PSP checks it; the BC's certqrc.zip list may lag behind revocations.",
  },
  { label: "Registered with the BC (in certqrc.zip)", fail: (f) => (f.has("notRegistered") ? "not in the ARQ list /api/v1/download/pub/cert/certqrc.zip" : null), note: "Downloaded at most once per 24 h and cached. New certs: deploy 7 days after registering." },
];

const FAULTS: Record<Profile, { id: Fault; label: string }[]> = {
  pic: [
    { id: "expired", label: "expired" },
    { id: "last24h", label: "expires in < 24 h" },
    { id: "revoked", label: "revoked" },
    { id: "untrusted", label: "untrusted root" },
    { id: "rsa1024", label: "RSA-1024" },
    { id: "e3", label: "e = 3" },
    { id: "homolog", label: "T cert in production" },
    { id: "notRegistered", label: "not registered" },
    { id: "wrongPurpose", label: "used to sign" },
  ],
  pia: [
    { id: "expired", label: "expired" },
    { id: "last24h", label: "expires in < 24 h" },
    { id: "revoked", label: "revoked" },
    { id: "untrusted", label: "untrusted root" },
    { id: "rsa1024", label: "RSA-1024" },
    { id: "e3", label: "e = 3" },
    { id: "homolog", label: "T cert in production" },
    { id: "notRegistered", label: "not registered" },
    { id: "wrongPurpose", label: "presented in TLS" },
  ],
  bc: [
    { id: "untrusted", label: "not v10 chain" },
    { id: "wrongCN", label: "wrong CN" },
    { id: "expired", label: "expired" },
    { id: "revoked", label: "revoked" },
  ],
  qrc: [
    { id: "untrusted", label: "unknown root" },
    { id: "notEV", label: "DV, not EV" },
    { id: "wildcard", label: "wildcard" },
    { id: "noServerAuth", label: "no serverAuth" },
    { id: "expired", label: "expired" },
    { id: "revoked", label: "revoked" },
    { id: "revUnknown", label: "revocation unknown" },
    { id: "notRegistered", label: "not registered" },
  ],
};

const CHECKS: Record<Profile, Check[]> = { pic: SPB_CHECKS("pic"), pia: SPB_CHECKS("pia"), bc: BC_CHECKS, qrc: QRC_CHECKS };
const WHO: Record<Profile, string> = {
  pic: "the BCB, during the TLS handshake",
  pia: "the BCB, for every signed message",
  bc: "your PSP, connecting to ICOM/DICT",
  qrc: "the payer's PSP app, reading a dynamic QR",
};

export function ChainValidator() {
  const [p, setP] = useState<Profile>("pic");
  const [faults, setFaults] = useState<Set<Fault>>(new Set());
  const [open, setOpen] = useState(2);
  const certs = chain(p, faults);
  const checks = CHECKS[p];
  let firstFail = -1;
  const results = checks.map((c, i) => {
    const r = c.fail(faults);
    if (r && firstFail < 0) firstFail = i;
    return r;
  });
  const toggle = (f: Fault) =>
    setFaults((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={p}
          onChange={(v) => {
            setP(v);
            setFaults(new Set());
          }}
          options={[
            { value: "pic", label: "CERTPIC" },
            { value: "pia", label: "CERTPIA" },
            { value: "bc", label: "BCB server cert" },
            { value: "qrc", label: "CERTQRC" },
          ]}
        />
        <span className="text-xs text-faint">validated by {WHO[p]}</span>
      </Controls>
      <div className="flex flex-wrap gap-2">
        {FAULTS[p].map((f) => (
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="Certificate chain">
          <ol className="space-y-2">
            {certs.map((c, i) => (
              <li key={i}>
                {i > 0 && <div className="ml-5 h-3 border-l border-dashed border-faint" />}
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className={clsx("w-full rounded-lg border px-3 py-2 text-left transition", open === i ? "border-orange-400/60 bg-orange-400/5" : "border-line bg-panel-2/50 hover:border-faint")}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">{c.title}</span>
                    <span className="font-mono text-[10.5px] text-faint">{c.role}</span>
                  </div>
                  {open === i && (
                    <dl className="mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11.5px]">
                      {c.fields.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-faint">{k}</dt>
                          <dd className="font-mono break-words text-muted">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title="Validation, in order">
            <ol className="space-y-1.5">
              {checks.map((c, i) => {
                const st = firstFail < 0 || i < firstFail ? "ok" : i === firstFail ? "fail" : "skip";
                return (
                  <li key={c.label} className={clsx("rounded-lg border px-2.5 py-1.5", st === "fail" ? "border-bad/50 bg-bad/10" : "border-line bg-panel-2/40", st === "skip" && "opacity-50")}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={clsx("size-2 shrink-0 rounded-full", st === "ok" ? "bg-ok" : st === "fail" ? "bg-bad" : "bg-line")} />
                      <span className="text-ink">{c.label}</span>
                      {st === "skip" && results[i] && <span className="ml-auto text-[10px] text-bad">also fails</span>}
                    </div>
                    <div className={clsx("mt-0.5 pl-4 text-[11px]", st === "fail" ? "text-bad" : "text-faint")}>{st === "fail" ? results[i] : c.note}</div>
                  </li>
                );
              })}
            </ol>
          </Panel>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="result" value={firstFail < 0 ? "accepted" : "rejected"} tone={firstFail < 0 ? "good" : "bad"} />
            <Stat label="first failing check" value={firstFail < 0 ? "—" : `#${firstFail + 1}`} hint={firstFail < 0 ? `${checks.length} checks passed` : `of ${checks.length}`} />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: on CERTPIC, tick &quot;expires in &lt; 24 h&quot;: the certificate is still technically valid, but the Pix already treats it as
        dead. On CERTQRC, tick &quot;revocation unknown&quot;: the payment must be refused. Compare with the BCB server certificate, where
        the manual says the opposite: if its revocation status cannot be checked, keep accepting it and notify DEINF, so that a CA outage
        cannot take the whole Pix down.
      </p>
    </div>
  );
}
