"use client";

import { useRef, useState } from "react";
import { Button, Callout, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { JsonView } from "./JsonView";
import { initWh, payloadOf, stepWh, type Attempt, type WhParams, type WhSim } from "./webhookSim";

const WIN = 40; // seconds of timeline shown
const codeColor = (a: Attempt) => (a.code === 200 ? "#34d399" : a.code === 404 ? "#f87171" : a.processed ? "#fbbf24" : a.code === "timeout" ? "#8a93a8" : "#fb923c");

/** Pre-run the deterministic sim for 30 simulated seconds so the timeline isn't empty on first paint. */
function warm(p: WhParams): WhSim {
  const s = initWh();
  for (let i = 0; i < 120; i++) stepWh(s, p);
  return s;
}

export function Webhooks() {
  const [url, setUrl] = useState("https://erp.example.com/api/webhook");
  const [p, setP] = useState<WhParams>({ failRate: 0.25, ackLoss: 0.1, misconfigured: false, maxAttempts: 5, backoff: 1, batch: false, dedup: "e2e+dev" });
  const sim = useRef<WhSim | null>(null);
  if (sim.current === null) sim.current = warm(p);
  const pRef = useRef(p);
  pRef.current = p;
  const tk = useTicker(() => stepWh(sim.current!, pRef.current), { speed: 0.5 });
  const s = sim.current;
  const set = <K extends keyof WhParams>(k: K, v: WhParams[K]) => setP((x) => ({ ...x, [k]: v }));
  const reset = () => {
    sim.current = warm(p);
    tk.refresh();
  };

  const rows = s.jobs.slice(-12);
  const t0 = Math.max(0, s.t - WIN);
  const X = (t: number) => Math.round(110 + ((t - t0) / WIN) * 480);
  const delivered = s.jobs.filter((j) => j.state === "delivered").length;
  const gaveup = s.jobs.filter((j) => j.state === "gaveup").length;
  const pending = s.jobs.filter((j) => j.state === "pending").length;
  const last = [...s.jobs].reverse().find((j) => j.attempts.length > 0);
  const target = url.replace(/\/$/, "") + "/pix";

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
          webhookUrl
          <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-xs text-ink outline-none" />
        </label>
        <span className="font-mono text-xs break-all text-muted">
          → PSP POSTs to <span className="text-accent">{target}</span>
        </span>
      </Controls>
      <Controls>
        <Button variant="primary" onClick={tk.toggle}>
          {tk.running ? "Pause" : "Play"}
        </Button>
        <Button onClick={tk.tick}>Step</Button>
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
        <span className="inline-flex items-center gap-2 text-muted">
          receiver serves
          <Segmented
            value={p.misconfigured ? "base" : "pix"}
            onChange={(v) => set("misconfigured", v === "base")}
            options={[
              { value: "pix", label: "{url}/pix" },
              { value: "base", label: "only {url}" },
            ]}
          />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          batching
          <Segmented value={p.batch ? "on" : "off"} onChange={(v) => set("batch", v === "on")} options={[{ value: "off", label: "off" }, { value: "on", label: "2 s window" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          receiver dedup key
          <Segmented
            value={p.dedup}
            onChange={(v) => set("dedup", v)}
            options={[
              { value: "e2e", label: "endToEndId" },
              { value: "e2e+dev", label: "endToEndId + devolução status" },
            ]}
          />
        </span>
      </Controls>
      <Controls>
        <Slider label="5xx / timeout" value={p.failRate} min={0} max={0.9} step={0.05} onChange={(v) => set("failRate", v)} format={(v) => `${Math.round(v * 100)}%`} className="min-w-52 flex-1" />
        <Slider label="ack lost" value={p.ackLoss} min={0} max={0.6} step={0.05} onChange={(v) => set("ackLoss", v)} format={(v) => `${Math.round(v * 100)}%`} className="min-w-52 flex-1" />
        <Slider label="max attempts" value={p.maxAttempts} min={1} max={8} onChange={(v) => set("maxAttempts", v)} className="min-w-44 flex-1" />
        <Slider label="backoff" value={p.backoff} min={0.5} max={4} step={0.5} onChange={(v) => set("backoff", v)} format={(v) => `${v} s ×2ⁿ`} className="min-w-44 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title={`Delivery attempts · t = ${s.t.toFixed(1)} s`}>
          <svg viewBox={`0 0 600 ${30 + rows.length * 22}`} className="w-full">
            {[0, 10, 20, 30, 40].map((d) => (
              <g key={d}>
                <line x1={X(t0 + d)} x2={X(t0 + d)} y1={14} y2={24 + rows.length * 22} stroke="#1c212c" />
                <text x={X(t0 + d)} y={10} fontSize={9} textAnchor="middle" fill="#5a6275">
                  {Math.round(t0 + d)}s
                </text>
              </g>
            ))}
            {rows.map((j, i) => {
              const y = 28 + i * 22;
              const col = j.state === "delivered" ? "#34d399" : j.state === "gaveup" ? "#f87171" : "#8a93a8";
              return (
                <g key={j.id}>
                  <text x={4} y={y + 3} fontSize={9.5} fill={col} fontFamily="var(--font-mono, monospace)">
                    #{j.id} {j.items.length > 1 ? `${j.items.length} pix` : j.items[0].dev ? "devol." : "pix"}
                  </text>
                  <text x={104} y={y + 3} fontSize={9} textAnchor="end" fill="#5a6275">
                    {j.state === "gaveup" ? "gave up" : j.state === "delivered" ? "" : "…"}
                  </text>
                  {j.created >= t0 && <circle cx={X(j.created)} cy={y} r={2.5} fill="#5a6275" />}
                  {j.attempts
                    .filter((a) => a.t >= t0)
                    .map((a, k) => (
                      <g key={k}>
                        <rect x={X(a.t) - 5} y={y - 6} width={10} height={12} rx={2} fill={codeColor(a)} />
                        <text x={X(a.t)} y={y + 3} fontSize={7.5} textAnchor="middle" fill="#0a0c11" fontWeight={700}>
                          {a.code === "timeout" ? "T" : String(a.code)[0]}
                        </text>
                      </g>
                    ))}
                  {j.state === "pending" && j.nextAt >= t0 && <circle cx={X(Math.min(j.nextAt, t0 + WIN))} cy={y} r={3} fill="none" stroke="#8a93a8" strokeDasharray="2 2" />}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-faint">
            <span><span className="text-ok">■</span> 200</span>
            <span><span className="text-[#fbbf24]">■</span> processed, 200 lost → PSP retries</span>
            <span><span className="text-[#fb923c]">■</span> 503</span>
            <span><span className="text-muted">■</span> timeout</span>
            <span><span className="text-bad">■</span> 404 (wrong path)</span>
          </div>
        </Panel>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Pix received" value={s.pixTotal} />
            <Stat label="without txid" value={s.pixNoTxid} hint="never notified" tone="warn" />
            <Stat label="delivered" value={delivered} tone="good" />
            <Stat label="pending" value={pending} />
            <Stat label="gave up" value={gaveup} tone={gaveup ? "bad" : "neutral"} hint="needs GET /pix sweep" />
            <Stat label="dup suppressed" value={s.dupSuppressed} hint="receiver idempotency" />
          </div>
          <Stat label="refund updates dropped" value={s.refundDropped} tone={s.refundDropped ? "bad" : "good"} hint="dedup on endToEndId alone swallows the devolução callback" />
        </div>
      </div>
      {last && (
        <Panel title={`Last POST ${target} (mTLS) — job #${last.id}`}>
          <JsonView value={payloadOf(last)} maxHeight={240} />
        </Panel>
      )}
      <Callout tone="info">
        Fixed by the spec: the URL ({"{webhookUrl}"}/pix — the PSP appends the suffix; /rec and /cobr for the Pix Automático webhooks), mTLS, only Pix with a txid, a call when a devolução reaches DEVOLVIDO or NAO_REALIZADO, and that several Pix of the same key may be grouped in one call. Not fixed: SLA,
        retry count, backoff, timeouts — each PSP defines them. Treat webhooks as a hint and reconcile with GET /pix.
      </Callout>
      <p className="text-xs text-faint">
        Try: switch the receiver to &quot;only {"{url}"}&quot; — every attempt 404s because the PSP posts to …/pix. Then set the dedup key to endToEndId only and watch &quot;refund updates dropped&quot; climb: the devolução callback reuses the original Pix&apos;s endToEndId.
      </p>
    </div>
  );
}
