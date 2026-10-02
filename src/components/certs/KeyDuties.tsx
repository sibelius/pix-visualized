"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";

type K = "pic" | "pia" | "qrc" | "jws" | "rsfn";
const KEYS: { id: K; label: string; where: string; detail: string }[] = [
  { id: "pic", label: "CERTPIC private key", where: "HSM / TLS terminator inside the RSFN zone", detail: "authenticates the TLS channel to ICOM, DICT, ARQ" },
  { id: "pia", label: "CERTPIA private key", where: "HSM, signing service only", detail: "signs every SPI message and DICT write" },
  { id: "qrc", label: "CERTQRC private key", where: "internet-facing TLS of the QR site", detail: "EV TLS of pix.<your-domain>" },
  { id: "jws", label: "JWS signing key", where: "QR payload signer", detail: "signs dynamic-QR payloads (x5c in the JWK Set)" },
  { id: "rsfn", label: "RSFN foothold", where: "a host on your RSFN network with a registered egress IP", detail: "not a key: network position inside your perimeter (or a PSTI's)" },
];

type Outcome = { sev: "critical" | "high" | "medium" | "low"; text: string };

function assess(c: Set<K>): Outcome[] {
  const o: Outcome[] = [];
  const pic = c.has("pic");
  const pia = c.has("pia");
  const net = c.has("rsfn");
  if (pic && pia && net)
    o.push({ sev: "critical", text: "Full impersonation: open an mTLS session as you and send validly signed pacs.008 debiting your Conta PI. This is the shape of the 2025 PSTI incidents, where attackers used legitimate credentials inside a provider's environment." });
  else if (pia && net && !pic)
    o.push({ sev: "high", text: "Signed messages are ready, but without the CERTPIC key the BCB refuses the TLS handshake. Separation bought time: deactivate the CERTPIA now." });
  else if (pic && net && !pia)
    o.push({ sev: "medium", text: "Can open sessions as you and read your outbound stream (GET /api/v1/out/…), but every message it sends fails signature verification. Confidentiality loss, not theft." });
  else if ((pic || pia) && !net)
    o.push({ sev: "medium", text: "Keys without a path: the ICOM is only reachable over the RSFN from IPs registered in SPB-Web. Still an incident: request emergency deactivation." });
  if (c.has("jws") && c.has("qrc"))
    o.push({ sev: "high", text: "Can serve a fake dynamic-QR payload that validates (registered EV certificate + JWS chain on the same site), if they can also get victims to the URL (DNS or the QR itself)." });
  else if (c.has("jws"))
    o.push({ sev: "medium", text: "Can sign payloads, but the payer's app fetches jku from the site in the CERTQRC; without that site the forged JWS has nowhere trusted to live." });
  else if (c.has("qrc"))
    o.push({ sev: "medium", text: "Can impersonate the QR site at the TLS layer, but payloads still need a valid JWS from the separate signing key." });
  if (net && !pic && !pia) o.push({ sev: "low", text: "Network access alone gets a TLS alert: no CERTPIC, no session." });
  if (!c.size) o.push({ sev: "low", text: "Nothing compromised." });
  return o;
}

const RESPONSE = [
  "Stop processing; use the SPB-Web SPI module to block outgoing payments (manual block) if the Conta PI is at risk.",
  "Send a BC Correio to DEINF/Pix, subject “Pix - Desativação de certificado”, from a registered Pix director: issuer + serial, justification, mode “decorrente de incidente de segurança”.",
  "Call the Central de Atendimento do Pix citing that BC Correio: incident-mode deactivation runs 24×7 (scheduled mode takes up to 2 business days).",
  "Revoke at the CA, generate new key pairs (never reuse a key or a CSR), upload new CPIC/CPIA via STA and wait for activation.",
];

const CEREMONY: { step: string; src: "SFN" | "Pix" | "practice" }[] = [
  { step: "Generate the RSA-2048 key pair inside the HSM, marked non-exportable", src: "practice" },
  { step: "Public exponent ≠ 3; modulus MSB = 1", src: "SFN" },
  { step: "A fresh key pair for every certificate; never reuse a public key in any other certificate, or across production and homologation", src: "SFN" },
  { step: "PKCS#10 CSR with C=BR, O=ICP-Brasil, OU=ISPB-xxxxxxxx, OU=SISBACEN-xxxxx, CN=<name> P|T nnn", src: "SFN" },
  { step: "Never reuse a CSR", src: "SFN" },
  { step: "Separate certificates for connection (CERTPIC) and signature (CERTPIA), exclusive to Pix", src: "Pix" },
  { step: "Dual control (m-of-n custodians), witnessed, logged", src: "practice" },
  { step: "Upload PEM (no chain, no private key) via STA ≥ 7 days before you need it", src: "Pix" },
  { step: "Archive the certificate and public key for historical verification; never archive the private key", src: "Pix" },
];

export function KeyDuties() {
  const [c, setC] = useState<Set<K>>(new Set(["pia", "rsfn"]));
  const [layout, setLayout] = useState<"separate" | "shared">("separate");
  const toggle = (k: K) =>
    setC((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      // a single shared key/cert for channel + signature: stealing one is stealing both
      if (layout === "shared" && (k === "pic" || k === "pia")) {
        if (n.has(k)) {
          n.add("pic");
          n.add("pia");
        } else {
          n.delete("pic");
          n.delete("pia");
        }
      }
      return n;
    });
  const out = assess(c);
  const worst = out.some((x) => x.sev === "critical") ? "critical" : out.some((x) => x.sev === "high") ? "high" : out.some((x) => x.sev === "medium") ? "medium" : "low";

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={layout}
          onChange={(v) => {
            setLayout(v);
            if (v === "shared")
              setC((s) => {
                const n = new Set(s);
                if (n.has("pic") || n.has("pia")) {
                  n.add("pic");
                  n.add("pia");
                }
                return n;
              });
          }}
          options={[
            { value: "separate", label: "separate CERTPIC / CERTPIA (required)" },
            { value: "shared", label: "one key for both (not allowed)" },
          ]}
        />
        <span className="text-xs text-faint">tick what the attacker has</span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel title="Keys and footholds">
          <ul className="space-y-1.5">
            {KEYS.map((k) => (
              <li key={k.id}>
                <label
                  className={clsx(
                    "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 transition",
                    c.has(k.id) ? "border-bad/50 bg-bad/10" : "border-line bg-panel-2/40 hover:border-faint",
                  )}
                >
                  <input type="checkbox" checked={c.has(k.id)} onChange={() => toggle(k.id)} className="mt-0.5 accent-red-400" />
                  <span className="min-w-0">
                    <span className="block text-xs text-ink">{k.label}</span>
                    <span className="block text-[11px] text-faint">
                      {k.detail} · <span className="font-mono">{k.where}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title="What the attacker can do" right={<Stat label="worst" value={worst} tone={worst === "critical" || worst === "high" ? "bad" : worst === "medium" ? "warn" : "good"} />}>
            <ul className="space-y-2">
              {out.map((x) => (
                <li key={x.text} className="flex gap-2 text-sm leading-relaxed text-muted">
                  <span className={clsx("mt-1 shrink-0 rounded px-1.5 font-mono text-[10px] uppercase", x.sev === "critical" ? "bg-bad/25 text-bad" : x.sev === "high" ? "bg-bad/15 text-bad" : x.sev === "medium" ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok")}>
                    {x.sev}
                  </span>
                  <span>{x.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
          {(c.has("pic") || c.has("pia")) && (
            <Panel title="Response (Manual de Segurança do Pix, 5.5)">
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
                {RESPONSE.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
      <Panel title="Key ceremony checklist">
        <ul className="grid gap-x-6 gap-y-1.5 text-xs md:grid-cols-2">
          {CEREMONY.map((s) => (
            <li key={s.step} className="flex gap-2">
              <span className={clsx("mt-px shrink-0 rounded px-1 font-mono text-[10px]", s.src === "practice" ? "bg-panel-2 text-faint" : "bg-orange-400/15 text-orange-300")}>
                {s.src === "SFN" ? "Man. SFN v.I" : s.src === "Pix" ? "Man. Pix" : "practice"}
              </span>
              <span className="text-muted">{s.step}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="text-xs text-faint">
        Try: with separate keys, tick only the CERTPIA key and the RSFN foothold: high, but not critical. Switch to &quot;one key for
        both&quot; and the same theft becomes full impersonation. Untick the foothold to see why the IP allow-list and the private network
        still matter when keys leak.
      </p>
    </div>
  );
}
