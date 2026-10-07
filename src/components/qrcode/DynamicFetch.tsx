"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";
import { makeKeys, runFlow, type FlowResult, type KeySet, type Scenario } from "./jwsFlow";
import { b64urlDecodeText, BCB_SAMPLE_JWS } from "./jwsSample";

const ICON = { ok: "✓", fail: "✕", skip: "·", warn: "!" } as const;

function pretty(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export function DynamicFetch() {
  const [keys, setKeys] = useState<KeySet | null>(null);
  const [sc, setSc] = useState<Scenario>({ host: "pix.example.com", tls: "1.3", alg: "PS256", tamper: "none", kidMismatch: false });
  const [res, setRes] = useState<FlowResult | null>(null);
  const [view, setView] = useState<"ours" | "bcb">("ours");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!globalThis.crypto?.subtle) {
      setErr("WebCrypto (crypto.subtle) is unavailable here — open the page over https or localhost.");
      return;
    }
    makeKeys().then(
      (k) => alive && setKeys(k),
      (e: unknown) => alive && setErr(String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!keys) return;
    let alive = true;
    runFlow(keys, sc).then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [keys, sc]);

  const set = <K extends keyof Scenario>(k: K) => (v: Scenario[K]) => setSc((s) => ({ ...s, [k]: v }));
  const parts = res ? res.jws.split(".") : [];
  const bcb = BCB_SAMPLE_JWS.split(".");

  return (
    <div data-export-browser-only={!res ? "" : undefined} className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          host
          <Segmented
            value={sc.host}
            onChange={set("host")}
            options={[
              { value: "pix.example.com", label: "pix.example.com" },
              { value: "pix-h.example.com", label: "pix-h (homolog)" },
              { value: "pix.examp1e.com", label: "examp1e (look-alike)" },
            ]}
          />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          TLS
          <Segmented value={sc.tls} onChange={set("tls")} options={[{ value: "1.3", label: "1.3" }, { value: "1.1", label: "1.1" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          alg
          <Segmented
            value={sc.alg}
            onChange={set("alg")}
            options={[
              { value: "PS256", label: "PS256" },
              { value: "RS256", label: "RS256" },
              { value: "HS256", label: "HS256" },
              { value: "none", label: "none" },
            ]}
          />
        </span>
      </Controls>
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          attack
          <Segmented
            value={sc.tamper}
            onChange={set("tamper")}
            options={[
              { value: "none", label: "none" },
              { value: "valor", label: "edit valor in transit" },
              { value: "resign", label: "re-sign with own key + own jku" },
            ]}
          />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          kid
          <Segmented
            value={sc.kidMismatch ? "bad" : "ok"}
            onChange={(v) => set("kidMismatch")(v === "bad")}
            options={[
              { value: "ok", label: "matches JWK Set" },
              { value: "bad", label: "stale kid" },
            ]}
          />
        </span>
      </Controls>

      {err && <div className="rounded-lg border border-bad/50 px-3 py-2 text-sm text-bad">{err}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Payer's PSP: validation pipeline" right={res && <span className={clsx("font-mono text-xs", res.accepted ? "text-ok" : "text-bad")}>{res.accepted ? "PAYLOAD ACCEPTED" : "REJECTED"}</span>}>
          {!res ? (
            <p className="text-sm text-faint">Generating RSA-2048 key pairs with crypto.subtle…</p>
          ) : (
            <ol className="space-y-2">
              {res.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className={clsx(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px]",
                      s.status === "ok" && "bg-ok/20 text-ok",
                      s.status === "fail" && "bg-bad/20 text-bad",
                      s.status === "warn" && "bg-warn/20 text-warn",
                      s.status === "skip" && "bg-panel-2 text-faint",
                    )}
                  >
                    {ICON[s.status]}
                  </span>
                  <div className="min-w-0">
                    <div className={clsx("text-sm", s.status === "skip" ? "text-faint" : "text-ink")}>
                      {i + 1}. {s.title}
                    </div>
                    <div className="text-xs leading-relaxed break-words text-muted">{s.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <div className="space-y-3">
          <Panel
            title="The JWS, piece by piece"
            right={
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "ours", label: "this simulation" },
                  { value: "bcb", label: "API Pix sample" },
                ]}
              />
            }
          >
            {view === "ours" && res ? (
              <>
                <div className="font-mono text-[11px] leading-5 break-all">
                  <span className="text-[#f472b6]">{parts[0]}</span>.<span className="text-[#38bdf8]">{parts[1]}</span>.
                  <span className="text-[#fbbf24]">{parts[2] ? parts[2].slice(0, 120) + (parts[2].length > 120 ? "…" : "") : "(empty)"}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <div className="mb-1 text-[11px] text-[#f472b6]">header = base64url-decode(part 1)</div>
                    <pre className="overflow-x-auto rounded-lg border border-line bg-bg/50 p-2 font-mono text-[10.5px] text-muted">{JSON.stringify(res.header, null, 2)}</pre>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 text-[11px] text-[#38bdf8]">payload = base64url-decode(part 2)</div>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-bg/50 p-2 font-mono text-[10.5px] text-muted">{pretty(res.payloadText)}</pre>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-[11px] leading-5 break-all">
                  <span className="text-[#f472b6]">{bcb[0]}</span>.<span className="text-[#38bdf8]">{bcb[1].slice(0, 90)}…</span>.<span className="text-[#fbbf24]">{bcb[2].slice(0, 60)}…</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <pre className="overflow-x-auto rounded-lg border border-line bg-bg/50 p-2 font-mono text-[10.5px] text-muted">{pretty(b64urlDecodeText(bcb[0]))}</pre>
                  <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-bg/50 p-2 font-mono text-[10.5px] text-muted">{pretty(b64urlDecodeText(bcb[1]))}</pre>
                </div>
                <p className="mt-2 text-xs text-muted">
                  The OpenAPI sample (GET /{"{pixUrlAccessToken}"}) uses RS256 with jku/kid/x5t borrowed from RFC 7517 examples; its signature is illustrative and does not
                  verify. Note the sample stringifies numbers (&quot;expiracao&quot;: &quot;3600&quot;, &quot;revisao&quot;: &quot;3&quot;) although the schema types them as integers.
                </p>
              </>
            )}
          </Panel>
          {res && view === "ours" && (
            <Panel title={`JWK Set at ${res.jwksUrl}`}>
              <pre className="max-h-40 overflow-auto font-mono text-[10.5px] leading-relaxed break-all whitespace-pre-wrap text-muted">
                {JSON.stringify({ keys: res.jwks.keys.map((k) => ({ ...k, n: String(k.n).slice(0, 32) + "…" })) }, null, 2)}
              </pre>
            </Panel>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="JWS size" value={res ? `${res.jws.length} B` : "—"} />
            <Stat label="signature" value={res && parts[2] ? `${Math.round((parts[2].length * 6) / 8)} B` : "—"} hint="RSA-2048 = 256 B" />
            <Stat label="x5t" value={res ? String(res.header.x5t).slice(0, 8) + "…" : "—"} hint="SHA-1 thumbprint" />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: &quot;edit valor in transit&quot; — the signature check (a real RSA-PSS verify) fails. Then &quot;re-sign with own key + own jku&quot;: the signature is now
        mathematically valid, and the payment is still rejected, because the key does not come from the site whose certificate is registered for Pix QR codes.
      </p>
    </div>
  );
}
