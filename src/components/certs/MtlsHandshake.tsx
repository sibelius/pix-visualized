"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { toHex, utf8 } from "@/components/xmldsig/c14n";
import { demoKeys } from "@/components/xmldsig/keys";

type Fault = "none" | "ip" | "cipher" | "mitm" | "pia" | "expired" | "nokey";
type Msg = { id: string; dir: "c2s" | "s2c" | "none"; name: string; fields: string[]; check?: string };

const MSGS: Msg[] = [
  { id: "tcp", dir: "c2s", name: "TCP connect :16422", fields: ["dst icom.pi.rsfn.net.br:16422 (primary channel)", "src = a public egress IP registered in SPB-Web (allow-list mandatory for the ICOM since 2026-07-23)"], check: "BCB: source IP must be registered in SPB-Web" },
  {
    id: "ch",
    dir: "c2s",
    name: "ClientHello",
    fields: ["version TLS 1.2", "cipher_suites: 0xc02f ECDHE-RSA-AES128-GCM-SHA256, …", "server_name: icom.pi.rsfn.net.br", "supported_groups: secp256r1, …", "client_random: 32 bytes"],
    check: "BCB: is there a common cipher suite? (0xc02f must be supported)",
  },
  { id: "sh", dir: "s2c", name: "ServerHello", fields: ["cipher_suite: 0xc02f", "server_random: 32 bytes", "session_id"] },
  {
    id: "scert",
    dir: "s2c",
    name: "Certificate (server)",
    fields: ["CN=*.pi.rsfn.net.br", "issuer: AC … SSL, ICP-Brasil v10 chain", "+ intermediates"],
    check: "PSP: v10 chain, *.pi.rsfn.net.br in CN, not expired (accept more than one active BC cert)",
  },
  { id: "ske", dir: "s2c", name: "ServerKeyExchange", fields: ["named_curve secp256r1", "server ECDHE public key (65 bytes)", "signature over randoms + params, with the server's RSA key"], check: "PSP: verify that signature with the server certificate's key" },
  { id: "cr", dir: "s2c", name: "CertificateRequest", fields: ["certificate_types: rsa_sign", "signature_algorithms: rsa_pkcs1_sha256, …", "certificate_authorities: ICP-Brasil SPB CAs"] },
  { id: "shd", dir: "s2c", name: "ServerHelloDone", fields: [] },
  {
    id: "ccert",
    dir: "c2s",
    name: "Certificate (client)",
    fields: ["CN=PSP Exemplo S.A. P001", "OU=ISPB-99999010", "issuer: CN=AC Exemplo SPB, OU=CSPB-0", "registered as CERTPIC"],
    check: "BCB: SPB-standard ICP-Brasil chain, registered & active as CERTPIC (connection), not deactivated",
  },
  { id: "cke", dir: "c2s", name: "ClientKeyExchange", fields: ["client ECDHE public key (65 bytes)", "both sides now compute the same pre-master secret"] },
  {
    id: "cv",
    dir: "c2s",
    name: "CertificateVerify",
    fields: ["RSA signature (CERTPIC private key) over SHA-256 of every handshake message so far"],
    check: "BCB: verify with the public key in the client certificate: proves the client holds the private key, not just a copy of the certificate",
  },
  { id: "cfin", dir: "c2s", name: "ChangeCipherSpec + Finished", fields: ["verify_data = PRF(master_secret, \"client finished\", transcript hash)", "first message under AES-128-GCM"] },
  { id: "sfin", dir: "s2c", name: "ChangeCipherSpec + Finished", fields: ["verify_data = PRF(master_secret, \"server finished\", …)"] },
  { id: "app", dir: "c2s", name: "POST /api/v1/in/99999010/msgs", fields: ["Host: icom.pi.rsfn.net.br (no port: sending one may break the connection)", "Content-Type: application/xml; charset=utf-8", "body: signed pacs.008 (CERTPIA)"], check: "201 Created + PI-ResourceId" },
];

const FAIL: Record<Exclude<Fault, "none">, { at: string; alert: string; by: "client" | "server" | "net"; why: string }> = {
  ip: { at: "tcp", alert: "connection refused / dropped", by: "net", why: "Source address not in the SPB-Web allow-list. The handshake never starts." },
  cipher: { at: "ch", alert: "alert handshake_failure (40)", by: "server", why: "No cipher suite in common: the client offered only suites the BCB does not accept." },
  mitm: { at: "scert", alert: "alert unknown_ca (48)", by: "client", why: "The server certificate does not chain to ICP-Brasil v10 or its CN is not *.pi.rsfn.net.br. A correct client aborts: this is what stops interception." },
  pia: { at: "ccert", alert: "alert bad_certificate (42)", by: "server", why: "The client presented its CERTPIA. Signature certificates may not authenticate the channel (and vice versa)." },
  expired: { at: "ccert", alert: "alert certificate_expired (45)", by: "server", why: "The CERTPIC is past notAfter − 24 h, so the BCB has deactivated it. The participant is offline until a new one is active." },
  nokey: { at: "cv", alert: "alert decrypt_error (51)", by: "server", why: "Someone copied the certificate file but signed CertificateVerify with a different private key. The RSA verification below really fails." },
};

const ALERT_NOTE = "Exact alert codes depend on the TLS stack; these are the RFC 5246 alerts a typical server sends.";

type Crypto = { ecdhC: string; ecdhS: string; equal: boolean; cvSig: string; cvOk: boolean };

export function MtlsHandshake() {
  const [fault, setFault] = useState<Fault>("none");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cr, setCr] = useState<Crypto | null>(null);

  const fail = fault === "none" ? null : FAIL[fault];
  const failIdx = fail ? MSGS.findIndex((m) => m.id === fail.at) : -1;
  const last = failIdx >= 0 ? failIdx : MSGS.length - 1;

  // real ECDHE (P-256) and a real CertificateVerify (RSA-2048 PKCS#1 v1.5 over the transcript hash)
  useEffect(() => {
    let live = true;
    (async () => {
      const gen = () => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
      const [c, s] = await Promise.all([gen(), gen()]);
      const bitsC = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: s.publicKey }, c.privateKey, 256));
      const bitsS = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: c.publicKey }, s.privateKey, 256));
      const k = await demoKeys();
      const transcript = utf8(MSGS.slice(1, 9).map((m) => m.name + m.fields.join("|")).join("\n"));
      const signer = fault === "nokey" ? k.b.privateKey : k.a.privateKey;
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, signer, transcript));
      const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, k.a.publicKey, sig, transcript);
      if (live) setCr({ ecdhC: toHex(bitsC, 12), ecdhS: toHex(bitsS, 12), equal: toHex(bitsC) === toHex(bitsS), cvSig: toHex(sig, 12), cvOk: ok });
    })();
    return () => {
      live = false;
    };
  }, [fault]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 750);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const cur = MSGS[Math.min(step, MSGS.length - 1)];
  const failedNow = failIdx >= 0 && step >= failIdx;
  const established = failIdx < 0 && step >= MSGS.length - 2;

  const L = 120;
  const R = 520;
  const rowY = (i: number) => 54 + i * 26;

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={() => (step >= last ? (setStep(0), setPlaying(true)) : setPlaying((p) => !p))}>
          {playing ? "Pause" : step >= last ? "Replay" : "Play"}
        </Button>
        <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ◀ Prev
        </Button>
        <Button onClick={() => setStep((s) => Math.min(last, s + 1))} disabled={step >= last}>
          Next ▶
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">inject</span>
          <Segmented
            value={fault}
            onChange={(v) => {
              setFault(v);
              setStep(0);
              setPlaying(false);
            }}
            options={[
              { value: "none", label: "nothing" },
              { value: "ip", label: "unregistered IP" },
              { value: "cipher", label: "no common cipher" },
              { value: "mitm", label: "fake server cert" },
              { value: "pia", label: "client sends CERTPIA" },
              { value: "expired", label: "CERTPIC deactivated" },
              { value: "nokey", label: "cert without its key" },
            ]}
          />
        </div>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title="TLS 1.2 full handshake, mutual authentication" bodyClassName="p-2">
          <svg viewBox={`0 0 640 ${rowY(MSGS.length) + 10}`} className="w-full" role="img" aria-label="TLS handshake sequence diagram">
            <text x={L} y={22} textAnchor="middle" fontSize={12} fill="#e7e9f0">
              PSP (client)
            </text>
            <text x={L} y={36} textAnchor="middle" fontSize={9.5} fill="#8a93a8" fontFamily="ui-monospace, monospace">
              CERTPIC
            </text>
            <text x={R} y={22} textAnchor="middle" fontSize={12} fill="#e7e9f0">
              ICOM (BCB)
            </text>
            <text x={R} y={36} textAnchor="middle" fontSize={9.5} fill="#8a93a8" fontFamily="ui-monospace, monospace">
              *.pi.rsfn.net.br
            </text>
            <line x1={L} y1={42} x2={L} y2={rowY(MSGS.length)} stroke="#242a38" />
            <line x1={R} y1={42} x2={R} y2={rowY(MSGS.length)} stroke="#242a38" />
            {MSGS.map((m, i) => {
              if (i > step) return null;
              const y = rowY(i);
              const isFail = i === failIdx;
              const c2s = m.dir === "c2s";
              const x1 = c2s ? L : R;
              const x2 = c2s ? R : L;
              const color = isFail ? "#f87171" : i === step ? "#fb923c" : "#5a6275";
              const dx = c2s ? -7 : 7;
              return (
                <g key={m.id} onClick={() => setStep(i)} className="cursor-pointer">
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={i === step ? 2 : 1.3} strokeDasharray={m.id === "tcp" ? "4 3" : undefined} />
                  <path d={`M${x2},${y} l${dx},-4 l0,8 z`} fill={color} />
                  <text x={(L + R) / 2} y={y - 5} textAnchor="middle" fontSize={10.5} fill={i === step ? "#e7e9f0" : "#8a93a8"}>
                    {m.name}
                  </text>
                  {isFail && fail && (
                    <text x={fail.by === "client" ? L - 8 : R + 8} y={y + 4} textAnchor={fail.by === "client" ? "end" : "start"} fontSize={10} fill="#f87171">
                      ✗
                    </text>
                  )}
                </g>
              );
            })}
            {failedNow && fail && (
              <text x={(L + R) / 2} y={rowY(failIdx) + 16} textAnchor="middle" fontSize={10.5} fill="#f87171" fontFamily="ui-monospace, monospace">
                {fail.by === "net" ? "" : fail.by === "client" ? "client → " : "server → "}
                {fail.alert}
              </text>
            )}
          </svg>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title={`${step + 1}. ${cur.name}`} right={<span className="font-mono text-[10.5px] text-faint">{cur.dir === "c2s" ? "client → server" : "server → client"}</span>}>
            <ul className="space-y-0.5 font-mono text-[11px] text-muted">
              {cur.fields.map((f) => (
                <li key={f} className="break-words">
                  {f}
                </li>
              ))}
            </ul>
            {cur.check && <p className="mt-2 text-xs text-ink/90">{cur.check}</p>}
            {failedNow && step === failIdx && fail && (
              <div className="mt-3 rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-xs text-bad">
                <div className="font-mono">{fail.alert}</div>
                <div className="mt-1 text-ink/80">{fail.why}</div>
                <div className="mt-1 text-[10.5px] text-faint">{ALERT_NOTE}</div>
              </div>
            )}
            {cr && (cur.id === "cke" || cur.id === "ske") && (
              <div className="mt-3 space-y-0.5 font-mono text-[10.5px] break-all">
                <div className="text-faint">real ECDH P-256, computed in your browser:</div>
                <div className="text-muted">client secret {cr.ecdhC}</div>
                <div className="text-muted">server secret {cr.ecdhS}</div>
                <div className={cr.equal ? "text-ok" : "text-bad"}>{cr.equal ? "equal without ever being sent" : "mismatch"}</div>
              </div>
            )}
            {cr && cur.id === "cv" && (
              <div className="mt-3 space-y-0.5 font-mono text-[10.5px] break-all">
                <div className="text-muted">signature {cr.cvSig} (256 bytes)</div>
                <div className={cr.cvOk ? "text-ok" : "text-bad"}>{cr.cvOk ? "verifies with the certificate's public key" : "does NOT verify with the certificate's public key"}</div>
              </div>
            )}
          </Panel>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="channel" value={failedNow ? "aborted" : established ? "established" : "handshaking"} tone={failedNow ? "bad" : established ? "good" : "neutral"} />
            <Stat label="certificates shown" value={step >= 7 ? "2" : step >= 3 ? "1" : "0"} hint="server's, then client's" />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: play the clean handshake, pausing on ServerKeyExchange and CertificateVerify. Then inject &quot;cert without its key&quot;: the
        certificate looks perfect, but the real RSA check of CertificateVerify fails, which is why a stolen certificate file alone is useless.
        &quot;Fake server cert&quot; is the one the client must catch itself.
      </p>
    </div>
  );
}
