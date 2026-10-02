"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Callout, Controls, Panel, Stat } from "@/components/ui";
import { JsonView } from "./JsonView";
import { CALLS, SCOPES, runFlow, thumbprint, type Faults } from "./securityModel";

const CERT_A = "subject=CN=erp.empresa.example.com,O=Empresa de Servicos SA,serialNumber=12345678000195;issuer=CN=PSP Example Client CA;serial=4F:A1:09:7C";
const CERT_B = "subject=CN=attacker.example.net;issuer=CN=PSP Example Client CA;serial=11:22:33:44";
const LANES = ["your ERP (client)", "Authorization Server", "API Pix (Resource Server)"];
const LX = [80, 300, 520];

export function Security() {
  const [faults, setFaults] = useState<Faults>({ tls11: false, selfSigned: false, stolen: false, expired: false });
  const [scopes, setScopes] = useState<string[]>(["cob.write", "cob.read", "pix.read"]);
  const [callIdx, setCallIdx] = useState(0);
  const [shown, setShown] = useState(99);
  const [thumbs, setThumbs] = useState<{ a: string; b: string }>({ a: "", b: "" });

  useEffect(() => {
    let live = true;
    Promise.all([thumbprint(CERT_A), thumbprint(CERT_B)]).then(([a, b]) => live && setThumbs({ a, b }));
    return () => {
      live = false;
    };
  }, []);

  const steps = useMemo(() => runFlow({ faults, scopes, call: CALLS[callIdx], thumbA: thumbs.a || "A", thumbB: thumbs.b || "B" }), [faults, scopes, callIdx, thumbs]);
  const vis = steps.slice(0, Math.min(shown, steps.length));
  const final = steps[steps.length - 1];
  const done = shown >= steps.length;
  const toggle = (k: keyof Faults) => {
    setFaults((f) => ({ ...f, [k]: !f[k] }));
    setShown(99);
  };
  const flip = (s: string) => {
    setScopes((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));
    setShown(99);
  };

  const token = {
    access_token: "eyJhbGciOiJQUzI1NiIsInR5cCI6ImF0K2p3dCJ9.eyJzdWIiOiJjbGllbnRfaWQtOTkxIi4uLn0.…",
    token_type: "Bearer",
    expires_in: 3600,
    scope: scopes.join(" "),
  };
  const claims = { iss: "https://pix.example.com", sub: "client_id-991", client_id: "client_id-991", scope: scopes.join(" "), exp: 1791032400, cnf: { "x5t#S256": thumbs.a || "…computing…" } };

  return (
    <div className="space-y-4">
      <Controls>
        <span className="text-muted">faults:</span>
        {(
          [
            ["tls11", "client speaks TLS 1.1"],
            ["selfSigned", "self-signed client cert"],
            ["stolen", "token replayed with another cert"],
            ["expired", "token expired"],
          ] as [keyof Faults, string][]
        ).map(([k, l]) => (
          <label key={k} className="inline-flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={faults[k]} onChange={() => toggle(k)} />
            {l}
          </label>
        ))}
      </Controls>
      <Controls>
        <label className="inline-flex min-w-0 items-center gap-2 text-sm text-muted">
          call
          <select value={callIdx} onChange={(e) => (setCallIdx(Number(e.target.value)), setShown(99))} className="min-w-0 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink">
            {CALLS.map((c, i) => (
              <option key={c.label} value={i}>
                {c.label} — needs {c.scope}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => setShown(1)}>Step from start</Button>
        <Button variant="primary" disabled={done} onClick={() => setShown((s) => Math.min(s, steps.length) + 1)}>
          Next step
        </Button>
        <Button variant="ghost" onClick={() => setShown(99)}>
          Show all
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Sequence">
          <svg viewBox={`0 0 600 ${60 + steps.length * 44}`} className="w-full">
            <defs>
              <marker id="api-sq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {LANES.map((l, i) => (
              <g key={l}>
                <text x={LX[i]} y={16} fontSize={11} textAnchor="middle" fill="#e7e9f0">
                  {l}
                </text>
                <line x1={LX[i]} x2={LX[i]} y1={26} y2={50 + steps.length * 44} stroke="#242a38" strokeDasharray="3 4" />
              </g>
            ))}
            {vis.map((s, i) => {
              const y = 50 + i * 44;
              const x1 = LX[s.from];
              const x2 = LX[s.to];
              const col = s.ok ? (s.from === 0 ? "#38bdf8" : "#a3e635") : "#f87171";
              return (
                <g key={i}>
                  <line x1={x1} x2={x2 + (x2 > x1 ? -4 : 4)} y1={y} y2={y} stroke={col} strokeWidth={1.6} markerEnd="url(#api-sq)" />
                  <text x={(x1 + x2) / 2} y={y - 6} fontSize={9.5} textAnchor="middle" fill={col} fontFamily="var(--font-mono, monospace)">
                    {s.label.length > 58 ? s.label.slice(0, 56) + "…" : s.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 space-y-1.5">
            {vis.map((s, i) => (
              <div key={i} className={clsx("rounded-md border px-2 py-1.5 text-xs", s.ok ? "border-line text-muted" : "border-bad/50 text-bad")}>
                <span className="font-mono text-faint">{i + 1}.</span> {s.detail}
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-3">
          <Stat label="outcome" value={done ? (final.ok ? "served" : final.label.split(" ")[0]) : "…"} tone={done ? (final.ok ? "good" : "bad") : "neutral"} hint={done ? final.label : `step ${vis.length}/${steps.length}`} />
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">token response</div>
            <JsonView value={token} maxHeight={160} />
          </div>
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">claims (if the PSP uses JWT)</div>
            <JsonView value={claims} maxHeight={200} />
          </div>
          <div className="font-mono text-[10.5px] break-all text-faint">
            thumb(cert A) = {thumbs.a || "…"}
            <br />
            thumb(cert B) = {thumbs.b || "…"}
          </div>
        </div>
      </div>
      <Panel title={`OAuth scopes in API Pix v2.10.0 (${SCOPES.length}) — click to request/drop`}>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {SCOPES.map(([s, d]) => (
            <label key={s} className={clsx("flex min-w-0 cursor-pointer items-baseline gap-2 rounded-md px-2 py-1 text-xs", scopes.includes(s) ? "bg-panel-2 text-ink" : "text-muted")}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => flip(s)} />
              <span className="font-mono">{s}</span>
              <span className="min-w-0 truncate text-faint">{d}</span>
            </label>
          ))}
        </div>
      </Panel>
      <Callout tone="info">
        Mandatory for every PSP (Anexo II §3.1): TLS ≥ 1.2 with forward secrecy; OAuth 2.0 client_credentials with mTLS; certificate-bound access tokens and a thumbprint check on the resource server; no self-signed client certs; onboarding in a logged-in channel; scopes per profile; client_id bound to
        the recebedor&apos;s CPF/CNPJ; audit logs kept ≥ 1 year; webhooks delivered over mTLS too. Token lifetime and format (JWT or opaque) are PSP choices.
      </Callout>
      <p className="text-xs text-faint">Try: tick &quot;token replayed with another cert&quot; — the token is valid and has the scope, but the thumbprint in cnf no longer matches the TLS session. Then untick it and drop cob.write.</p>
    </div>
  );
}
