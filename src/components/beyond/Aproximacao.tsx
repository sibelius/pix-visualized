"use client";

import { useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Hint } from "./shared";
import { apdus, checkCrc, hex, ndefMessage, pixUri, sampleBrCode } from "./tapToPix";

const ACTORS = ["Payer", "Wallet (ITP)", "Account holder (detentora)", "POS", "SPI"] as const;
type Actor = (typeof ACTORS)[number];

type Step = { phase: "enroll" | "pay"; from: Actor; to: Actor; msg: string; detail: string; status?: string };

/** JSR flow, paraphrased from Res. BCB 406/2024 and the Open Finance Brasil "Enrollments" API.
 * Endpoint and status names follow Enrollments API v2 — check the current Open Finance spec version. */
const STEPS: Step[] = [
  { phase: "enroll", from: "Payer", to: "Wallet (ITP)", msg: "Add bank account to wallet", detail: "The payer picks the bank (the detentora) inside the ITP's app, e.g. a phone wallet." },
  { phase: "enroll", from: "Wallet (ITP)", to: "Account holder (detentora)", msg: "POST /enrollments", detail: "Creates a device-linking request with permissions (PAYMENTS_INITIATE) and the debtor account, followed by POST /enrollments/{id}/risk-signals with device data.", status: "AWAITING_RISK_SIGNALS → AWAITING_ACCOUNT_HOLDER_VALIDATION" },
  { phase: "enroll", from: "Wallet (ITP)", to: "Account holder (detentora)", msg: "Redirect (the only one)", detail: "The payer is sent once to the bank's app, logs in with the bank's own strong authentication and approves the link and a per-transaction/day limit.", status: "AWAITING_ENROLLMENT" },
  { phase: "enroll", from: "Account holder (detentora)", to: "Wallet (ITP)", msg: "POST /enrollments/{id}/fido-registration-options", detail: "The bank returns a WebAuthn/FIDO2 challenge and relying-party data." },
  { phase: "enroll", from: "Payer", to: "Wallet (ITP)", msg: "Biometric → new key pair", detail: "The phone creates a FIDO credential bound to this device; the private key never leaves the secure hardware." },
  { phase: "enroll", from: "Wallet (ITP)", to: "Account holder (detentora)", msg: "POST /enrollments/{id}/fido-registration", detail: "Sends the attestation with the public key. The bank stores it against this device and account.", status: "AUTHORISED" },
  { phase: "pay", from: "POS", to: "Wallet (ITP)", msg: "NFC: SELECT A000000940BCB000 + UPDATE BINARY", detail: "The terminal pushes an NDEF URI record pix://host?qr=<Copia e Cola>. From here it is a QR Code payment: the wallet resolves the location URL and validates the JWS payload." },
  { phase: "pay", from: "Wallet (ITP)", to: "Account holder (detentora)", msg: "POST /consents + POST /enrollments/{id}/fido-sign-options", detail: "Creates the payment consent (amount, creditor from the payload) and asks for a signing challenge." },
  { phase: "pay", from: "Payer", to: "Wallet (ITP)", msg: "Biometric → FIDO assertion", detail: "The confirmation screen is mandatory (Manual de Segurança §4.4); the payer approves with biometrics, signing the challenge." },
  { phase: "pay", from: "Wallet (ITP)", to: "Account holder (detentora)", msg: "POST /consents/{id}/authorise + POST /pix/payments", detail: "The bank verifies the assertion with the stored public key — no redirect — and accepts the payment." },
  { phase: "pay", from: "Account holder (detentora)", to: "SPI", msg: "pacs.008  LclInstrm=APDN  InitgPty=CNPJ of ITP", detail: "APDN (tap, dynamic payload) or APES (tap, static). InitgPty/Id carries the ITP's CNPJ because the Pix was started through an initiation service; TxId comes from the payload." },
  { phase: "pay", from: "SPI", to: "Account holder (detentora)", msg: "pacs.002 ACSC", detail: "Settled in the payer's and receiver's PSPs' Conta PI; the wallet shows the receipt." },
];

const AX = (a: Actor) => 60 + ACTORS.indexOf(a) * 130;

export function Aproximacao() {
  const [step, setStep] = useState(0);
  const [host, setHost] = useState("pix.padaria.example");
  const [code, setCode] = useState(() => sampleBrCode("qr.psp.example/v2/cobv/9d36b84f6c7a4e9c8a1b2c3d4e5f6a7b"));
  const [chunk, setChunk] = useState(128);
  const [view, setView] = useState<"apdu" | "ndef">("apdu");
  const crc = checkCrc(code);
  const uri = pixUri(host, code);
  const nd = ndefMessage(uri);
  const cmds = apdus(nd.bytes, chunk);
  const s = STEPS[step];

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={() => setStep((x) => Math.min(STEPS.length - 1, x + 1))} disabled={step === STEPS.length - 1}>
          Next step
        </Button>
        <Button onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>
          Back
        </Button>
        <Button variant="ghost" onClick={() => setStep(0)}>
          Reset
        </Button>
        <Button variant="ghost" onClick={() => setStep(6)}>
          Jump to tap
        </Button>
        <span className="font-mono text-xs text-muted">
          {s.phase === "enroll" ? "phase 1 · enrollment (once per device)" : "phase 2 · tap to pay (every time)"} · step {step + 1}/{STEPS.length}
        </span>
      </Controls>
      <Panel title="Jornada Sem Redirecionamento: enroll once, then tap" right={<span className="text-[11px] text-faint">per Open Finance Enrollments API; check current version</span>}>
        <svg viewBox="0 0 660 250" className="w-full select-none">
          {ACTORS.map((a) => (
            <g key={a}>
              <rect x={AX(a) - 55} y={6} width={110} height={26} rx={6} fill="#171b24" stroke="#242a38" />
              <text x={AX(a)} y={23} fontSize={10.5} textAnchor="middle" fill="#e7e9f0">
                {a}
              </text>
              <line x1={AX(a)} y1={32} x2={AX(a)} y2={244} stroke="#242a38" strokeDasharray="3 4" />
            </g>
          ))}
          {STEPS.slice(0, step + 1).map((st, i) => {
            const y = 46 + i * 16.5;
            const x1 = AX(st.from);
            const x2 = AX(st.to);
            const cur = i === step;
            const col = st.phase === "enroll" ? "#fbbf24" : "#32bcad";
            const dir = x2 > x1 ? 1 : -1;
            return (
              <g key={i} opacity={cur ? 1 : 0.45}>
                <line x1={x1} y1={y} x2={x2 - dir * 4} y2={y} stroke={col} strokeWidth={cur ? 2 : 1.2} />
                <path d={`M${x2} ${y} l${-dir * 6} -3.5 v7 z`} fill={col} />
                <text x={(x1 + x2) / 2} y={y - 3} fontSize={8.5} textAnchor="middle" fill={cur ? "#e7e9f0" : "#8a93a8"} fontFamily="monospace">
                  {st.msg.length > 46 ? st.msg.slice(0, 44) + "…" : st.msg}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 rounded-lg border border-line bg-panel-2/60 p-3 text-sm">
          <div className="font-mono text-xs text-accent">{s.msg}</div>
          <p className="mt-1 text-muted">{s.detail}</p>
          {s.status && <div className="mt-1 font-mono text-[11px] text-warn">enrollment status: {s.status}</div>}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="What the terminal actually sends (computed)">
          <label className="block text-xs text-muted">
            Pix Copia e Cola (edit it — the CRC is checked)
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              rows={3}
              className="mt-1 w-full rounded-md border border-line bg-bg p-2 font-mono text-[11px] text-ink"
            />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            hostname
            <input value={host} onChange={(e) => setHost(e.target.value)} className="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-ink" />
          </label>
          <div className="mt-3 text-xs text-muted">URI</div>
          <div className="break-all rounded-md border border-line bg-bg p-2 font-mono text-[11px] text-ink">{uri}</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "apdu", label: "APDUs" },
                { value: "ndef", label: "NDEF message" },
              ]}
            />
            <Slider label="bytes per UPDATE BINARY" value={chunk} min={32} max={250} step={2} onChange={setChunk} className="min-w-56 flex-1" />
          </div>
          {view === "ndef" ? (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-bg p-2 font-mono text-[11px]">
              <span className="text-warn">{hex(nd.bytes.slice(0, nd.headerLen))}</span> <span className="text-[#818cf8]">{hex(nd.bytes.slice(nd.headerLen, nd.headerLen + 1))}</span>{" "}
              <span className="text-muted">{hex(nd.bytes.slice(nd.headerLen + 1))}</span>
            </pre>
          ) : (
            <div className="mt-2 max-h-72 space-y-2 overflow-auto">
              {cmds.map((c, i) => (
                <div key={i} className="rounded-md border border-line bg-bg p-2">
                  <div className="flex flex-wrap justify-between gap-2 text-[11px]">
                    <span className="font-mono text-accent">{c.label}</span>
                    <span className="text-faint">{c.note}</span>
                  </div>
                  <div className="mt-1 break-all font-mono text-[10.5px] text-muted">
                    <span className="text-warn">{hex(c.bytes.slice(0, c.head))}</span> {hex(c.bytes.slice(c.head))}
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-dashed border-line p-2 text-[11px] text-faint">Terminal then disconnects logically, so the wallet opens at once.</div>
            </div>
          )}
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="BR Code CRC" value={crc.ok ? "valid" : "invalid"} tone={crc.ok ? "good" : "bad"} hint={crc.ok ? "6304 + CRC16" : crc.expected ? `expected ${crc.expected}` : "no 6304 tag at end"} />
            <Stat label="URI bytes" value={nd.payloadLen - 1} hint="spec: ~260 typical" />
            <Stat label="NDEF record" value={nd.short ? "short" : "long"} hint={nd.short ? "header D1, 1-byte len" : "header C1, 4-byte len"} tone={nd.short ? "neutral" : "warn"} />
            <Stat label="APDUs" value={cmds.length} hint="SELECT + UPDATE BINARY" />
          </div>
          <div className="rounded-xl border border-line bg-panel p-3 text-[13px] leading-relaxed text-muted">
            Tap changes only how the payload reaches the phone. The same JWS checks as a camera scan apply, and a confirmation screen is required. In the SPI it shows up as{" "}
            <span className="font-mono text-ink">APDN</span>/<span className="font-mono text-ink">APES</span> instead of <span className="font-mono">QRDN</span>/<span className="font-mono">QRES</span>,
            and the Regulamento counts it as a purchase for fee purposes. The R$500 per-tap cap (IN 629) was revoked from 1 Oct 2026 by IN 746, so taps now use the account's normal limits.
          </div>
        </div>
      </div>
      <Hint>step through enrollment, then edit one character of the Copia e Cola (the CRC turns red), or shrink the chunk size to see the NDEF split across more UPDATE BINARY commands with growing P1P2 offsets.</Hint>
    </div>
  );
}
