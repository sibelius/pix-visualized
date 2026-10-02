"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { ISPB } from "./model";

type Fault = "none" | "ip" | "nocert" | "certpia" | "expired" | "ispb";
const FAULTS: { value: Fault; label: string }[] = [
  { value: "none", label: "all good" },
  { value: "ip", label: "egress IP not allowlisted" },
  { value: "nocert", label: "no client cert" },
  { value: "certpia", label: "CERTPIA used for TLS" },
  { value: "expired", label: "cert expired" },
  { value: "ispb", label: "path ISPB ≠ cert" },
];

type Step = { dir: "→" | "←" | "×"; who: string; what: string; detail: string; rtt?: number; bad?: boolean };

function steps(f: Fault): Step[] {
  const tcp: Step = { dir: "→", who: "TCP", what: "SYN → SYN-ACK → ACK", detail: "Over the RSFN (directly or through a PSTI). DNS: honour the TTL, the BCB may resolve per PSP or round-robin.", rtt: 1 };
  if (f === "ip")
    return [
      { ...tcp, dir: "×", what: "connection not accepted", detail: "Since 23/07/2026 the ICOM only accepts public egress IPs registered by the participant in SPI-Web (Gestão de Conexão). Never register private ranges (10/8, 172.16/12, 192.168/16).", bad: true },
    ];
  const hello: Step[] = [
    tcp,
    { dir: "→", who: "TLS", what: "ClientHello", detail: "TLS 1.2 (the ICOM manual says 1.2; the Security manual v6.00 says 1.2 or higher). The offered suites must include ECDHE-RSA-AES128-GCM-SHA256 (0xC02F). SNI icom.pi.rsfn.net.br." },
    {
      dir: "←",
      who: "TLS",
      what: "ServerHello · Certificate · ServerKeyExchange · CertificateRequest · ServerHelloDone",
      detail: "Server picks 0xC02F, sends the BCB's ICP-Brasil v10-chain certificate (*.pi.rsfn.net.br), signed ECDHE parameters, and asks for a client certificate: mutual TLS is mandatory.",
      rtt: 1,
    },
  ];
  if (f === "nocert")
    return [...hello, { dir: "→", who: "TLS", what: "Certificate (empty)", detail: "No client certificate." }, { dir: "×", who: "TLS", what: "alert: handshake_failure", detail: "Mutual authentication is mandatory; the server closes the connection before any HTTP.", bad: true }];
  if (f === "certpia")
    return [
      ...hello,
      { dir: "→", who: "TLS", what: "Certificate (CERTPIA)", detail: "The signing certificate offered for the channel." },
      { dir: "×", who: "TLS", what: "TLS alert (bad_certificate)", detail: "Since 08/06/2026 certificates are purpose-segregated: CERTPIC authenticates the channel, CERTPIA signs messages. Neither can do the other's job.", bad: true },
    ];
  if (f === "expired")
    return [
      ...hello,
      { dir: "→", who: "TLS", what: "Certificate (CERTPIC, expired)", detail: "" },
      { dir: "×", who: "TLS", what: "TLS alert (bad_certificate / certificate_expired)", detail: "The BCB deactivates certificates 24 h before expiry, so the real deadline is a day earlier than notAfter. Rotate through STA (file code CPIC) at least 7 days ahead: activation can take up to 7 days.", bad: true },
    ];
  const ok: Step[] = [
    ...hello,
    {
      dir: "→",
      who: "TLS",
      what: "Certificate (CERTPIC) · ClientKeyExchange · CertificateVerify · ChangeCipherSpec · Finished",
      detail: `ICP-Brasil SPB-standard CERTPIC (RSA 2048) of ISPB ${ISPB}, activated at the BCB. CertificateVerify proves you hold the private key. The TLS identity now binds every request on this connection to your ISPB.`,
    },
    { dir: "←", who: "TLS", what: "ChangeCipherSpec · Finished", detail: "Handshake done: 2 round trips for a full TLS 1.2 handshake.", rtt: 1 },
    { dir: "→", who: "HTTP", what: `POST /api/v1/in/${f === "ispb" ? "99999999" : ISPB}/msgs HTTP/1.1`, detail: "Host: icom.pi.rsfn.net.br (no port) · Content-Type: application/xml; charset=utf-8 · Content-Encoding: gzip · Content-Length." },
  ];
  if (f === "ispb")
    return [...ok, { dir: "←", who: "HTTP", what: "403 Forbidden · application/problem+xml", detail: "TLS was fine, but the {ispb} in the path is not the ISPB of the certificate on this connection. Nothing was stored. Do not retry.", rtt: 1, bad: true }];
  return [...ok, { dir: "←", who: "HTTP", what: "201 Created · PI-ResourceId: UEkBbgR78VqKK/uvuq9O0r9bqXyBH9Ur", detail: "Stored, will be processed. Keep the connection open for the next request.", rtt: 1 }];
}

const CODES: { code: string; stored: "yes" | "no" | "maybe" | "n/a"; when: string; act: string }[] = [
  { code: "201", stored: "yes", when: "POST stored", act: "Record the PI-ResourceId(s) (keep them 10 years with the XML). Wait for pacs.002/admi.002 on the read stream." },
  { code: "200 / 204", stored: "n/a", when: "GET stream: messages / nothing within the long-poll wait", act: "Store the body (if 200), then GET the PI-Pull-Next immediately. 204 is normal, not an error." },
  { code: "400 / 411 / 415", stored: "no", when: "malformed request: charset, missing length, wrong Content-Type/Encoding", act: "Bug in your client. Fix it; do not resend the same bytes." },
  { code: "403", stored: "no", when: "path ISPB ≠ certificate, or access not allowed", act: "Check certificate/ISPB/allowlist configuration. Not retryable." },
  { code: "410", stored: "n/a", when: "stream resource already gone (e.g. DELETE twice)", act: "On DELETE it counts as success. On GET: start a new stream." },
  { code: "413", stored: "no", when: "body too large (limit not published)", act: "Split the batch: fewer parts, or fewer operations per message." },
  { code: "429", stored: "no", when: "token bucket empty, or more than 6 reader streams", act: "Wait Retry-After seconds. For readers: lower the thread count." },
  { code: "503", stored: "no", when: "too many simultaneous connections, or opening/closing too often", act: "Back off; reuse persistent connections; cap your pool. The body says which." },
  { code: "500 / 502 / timeout", stored: "maybe", when: "API-side failure, or you never saw the response", act: "Retry the same message. The SPI is idempotent per operation (EndToEndId, RtrId…), so a resend gets a new PI-ResourceId but cannot pay twice. Report 5xx to SPI support." },
];

export function TlsLifecycle() {
  const [fault, setFault] = useState<Fault>("none");
  const [rtt, setRtt] = useState(18);
  const [i, setI] = useState(0);
  const ss = steps(fault);
  const tk = useTicker(() => setI((x) => (x < ss.length ? x + 1 : x)), { speed: 0.025 });
  const [sel, setSel] = useState("500 / 502 / timeout");
  const { pause } = tk;
  useEffect(() => {
    if (i >= ss.length) pause();
  }, [i, ss.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = ss.slice(0, i);
  const rtts = ss.reduce((a, s) => a + (s.rtt ?? 0), 0);
  const cold = (1 + 2 + 1) * rtt;
  const warm = rtt;

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={() => (i >= ss.length ? (setI(0), tk.play()) : tk.toggle())}>
          {tk.running ? "Pause" : i >= ss.length ? "Replay" : "Play"}
        </Button>
        <Button onClick={() => setI((x) => Math.min(ss.length, x + 1))}>Step</Button>
        <span className="inline-flex flex-wrap items-center gap-2 text-muted">
          inject
          <Segmented
            value={fault}
            onChange={(v) => {
              setFault(v);
              setI(0);
            }}
            options={FAULTS}
          />
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Panel title={`PSP ${ISPB}  ⇄  icom.pi.rsfn.net.br:16422`}>
          <ol className="space-y-2">
            {ss.map((s, k) => (
              <li
                key={k}
                className={clsx(
                  "grid grid-cols-[3.2rem_1fr] gap-3 rounded-lg border px-3 py-2 transition",
                  k < i ? (s.bad ? "border-bad/60 bg-bad/10" : "border-line bg-panel-2/60") : "border-line/40 opacity-30",
                )}
              >
                <div className="font-mono text-xs">
                  <div className={s.bad ? "text-bad" : "text-accent"}>{s.who}</div>
                  <div className="text-lg leading-none text-muted">{s.dir === "→" ? "PSP→" : s.dir === "←" ? "←BCB" : "✕"}</div>
                </div>
                <div className="min-w-0">
                  <div className={clsx("font-mono text-[12px] break-words", s.bad ? "text-bad" : "text-ink")}>{s.what}</div>
                  {k < i && s.detail && <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{s.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
          {i === 0 && <div className="mt-2 text-sm text-faint">Press Play or Step.</div>}
        </Panel>
        <div className="grid content-start gap-2">
          <Slider label="RTT" value={rtt} min={2} max={120} step={1} onChange={setRtt} format={(v) => `${v} ms`} />
          <Stat label="this exchange" value={`${rtts} RTT`} hint={`≈ ${rtts * rtt} ms before the first answer`} />
          <Stat label="new connection per request" value={`${cold} ms`} tone="warn" hint="TCP 1 + TLS 2 + HTTP 1 RTT, plus RSA work on both sides" />
          <Stat label="persistent connection" value={`${warm} ms`} tone="good" hint="HTTP 1 RTT. Frequent open/close can also earn a 503." />
        </div>
      </div>
      <Panel title="Status codes: was it stored, and what do you do?" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead className="border-b border-line text-[11px] text-faint uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">code</th>
                <th className="px-3 py-2 font-medium">stored?</th>
                <th className="px-3 py-2 font-medium">when</th>
                <th className="px-3 py-2 font-medium">do</th>
              </tr>
            </thead>
            <tbody>
              {CODES.map((c) => (
                <tr key={c.code} onClick={() => setSel(c.code)} className={clsx("cursor-pointer border-b border-line/50 align-top", sel === c.code && "bg-panel-2")}>
                  <td className="px-3 py-2 font-mono text-ink">{c.code}</td>
                  <td className={clsx("px-3 py-2 font-mono", c.stored === "yes" ? "text-ok" : c.stored === "no" ? "text-muted" : c.stored === "maybe" ? "text-warn" : "text-faint")}>{c.stored}</td>
                  <td className="px-3 py-2 text-muted">{c.when}</td>
                  <td className="px-3 py-2 text-muted">{c.act}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: inject each fault and step through. Only the last one gets as far as HTTP, and it fails with 403. Then drag the RTT and compare a fresh connection per
        request with a persistent one.
      </p>
    </div>
  );
}
