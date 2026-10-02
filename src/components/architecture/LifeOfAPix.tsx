"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { DEFAULT_BUDGET, LANES, LIMIT_MS, VALIDATION_MS, buildSteps, type Budget, type Scenario } from "./lifecycle";

const W = 820;
const LEFT = 86;
const laneX = (i: number) => Math.round(LEFT + 50 + i * 122);
const ROW = 30;
const TOP = 58;

const sec = (ms: number) => `${ms < 0 ? "−" : "+"}${(Math.abs(ms) / 1000).toFixed(ms !== 0 && Math.abs(ms) < 10_000 ? 2 : 1)} s`;
const brl = (v: number) => `R$ ${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function LifeOfAPix() {
  const [sc, setSc] = useState<Scenario>("ok");
  const [b, setB] = useState<Budget>(DEFAULT_BUDGET);
  const [k, setK] = useState(99);
  const prog = useRef(0);

  const effective: Scenario =
    sc === "ok" && b.payer > VALIDATION_MS ? "ab11" : sc === "ok" && b.payer + b.spiIn + b.receiver > LIMIT_MS ? "timeout" : sc;
  const steps = buildSteps(effective, b);
  const n = steps.length;
  const cur = Math.min(k, n - 1);

  const ticker = useTicker(
    () => {
      prog.current += 0.035;
      if (prog.current >= 1) {
        prog.current = 0;
        setK((x) => {
          if (x >= n - 1) {
            ticker.pause();
            return x;
          }
          return x + 1;
        });
      }
    },
    { speed: 1 },
  );

  const reset = () => {
    ticker.pause();
    prog.current = 0;
    setK(0);
  };
  const setScenario = (s: Scenario) => {
    setSc(s);
    ticker.pause();
    prog.current = 0;
    setK(99);
  };
  const setBudget = (patch: Partial<Budget>) => setB((x) => ({ ...x, ...patch }));

  const H = TOP + n * ROW + 10;
  const step = steps[cur];
  const p = ticker.running ? prog.current : 1;
  const t4 = steps.find((s) => s.mark === "t4")?.t ?? null;
  const t6 = steps.find((s) => s.mark === "t6a")?.t ?? null;
  const failed = effective !== "ok";

  // budget bar
  const [zoom, setZoom] = useState<"12" | "45">("12");
  const span = zoom === "12" ? 12_000 : 45_000;
  const segs = [
    { label: "payer PSP t1−t0′", v: b.payer, c: "#32bcad" },
    { label: "SPI in t2−t1", v: b.spiIn, c: "#818cf8" },
    { label: "payee PSP t3′−t2", v: b.receiver, c: "#f472b6" },
    { label: "SPI out t5a−t3′", v: b.spiOut, c: "#a78bfa" },
    { label: "notify t6a−t5a", v: b.notify, c: "#8a93a8" },
  ];
  let acc = 0;

  return (
    <div className="space-y-4">
      <Controls>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => (cur >= n - 1 ? (reset(), ticker.play()) : ticker.toggle())}>
            {ticker.running ? "Pause" : cur >= n - 1 ? "Replay" : "Play"}
          </Button>
          <Button onClick={() => setK(Math.max(0, cur - 1))} disabled={cur === 0}>
            ◀
          </Button>
          <Button onClick={() => setK(Math.min(n - 1, cur + 1))} disabled={cur >= n - 1}>
            Step ▶
          </Button>
          <span className="font-mono text-xs text-faint">
            {cur + 1}/{n}
          </span>
        </div>
        <Segmented
          value={sc}
          onChange={setScenario}
          options={[
            { value: "ok", label: "Happy path" },
            { value: "ac03", label: "Payee account invalid" },
            { value: "am04", label: "Conta PI empty" },
            { value: "timeout", label: "Payee PSP hangs" },
          ]}
        />
      </Controls>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Sequence · one Pix between two direct participants" bodyClassName="p-2 sm:p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sequence diagram of one Pix">
            <defs>
              {["#32bcad", "#f87171", "#818cf8", "#5a6275"].map((c) => (
                <marker key={c} id={`life-arr-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={c} />
                </marker>
              ))}
            </defs>
            {LANES.map((l, i) => (
              <g key={l}>
                <rect x={laneX(i) - 58} y={6} width={116} height={28} rx={7} fill={i === 3 ? "#1d2030" : "#171b24"} stroke={i === 3 ? "#818cf8" : "#242a38"} />
                <text x={laneX(i)} y={24} textAnchor="middle" fontSize={11.5} fill="#e7e9f0">
                  {l}
                </text>
                <line x1={laneX(i)} x2={laneX(i)} y1={36} y2={H - 4} stroke="#242a38" strokeDasharray="3 4" />
              </g>
            ))}
            {steps.map((s, i) => {
              if (i > cur) return null;
              const y = TOP + i * ROW + 12;
              const active = i === cur;
              const col = s.tone === "bad" ? "#f87171" : s.msg ? (s.from === 3 || s.to === 3 ? "#818cf8" : "#32bcad") : "#5a6275";
              const op = active ? 1 : 0.55;
              const x1 = laneX(s.from);
              const x2 = laneX(s.to);
              const isSelf = s.from === s.to;
              const frac = active ? p : 1;
              const xe = Math.round(x1 + (x2 - x1) * frac);
              return (
                <g key={i} opacity={op} onClick={() => setK(i)} className="cursor-pointer">
                  <text x={6} y={y + 4} fontSize={10} fill={s.mark ? "#f5a524" : "#5a6275"} fontFamily="ui-monospace,monospace">
                    {s.mark ? `${s.mark}` : ""}
                  </text>
                  <text x={LEFT - 4} y={y + 4} fontSize={9.5} textAnchor="end" fill="#8a93a8" fontFamily="ui-monospace,monospace">
                    {sec(s.t)}
                  </text>
                  {isSelf || !s.msg ? (
                    <>
                      <circle cx={x1} cy={y} r={5} fill={s.tone === "bad" ? "#f87171" : s.tone === "ok" ? "#34d399" : "#8a93a8"} />
                      <text x={s.from >= 4 ? x1 - 10 : x1 + 10} y={y + 4} fontSize={10.5} textAnchor={s.from >= 4 ? "end" : "start"} fill={active ? "#e7e9f0" : "#8a93a8"}>
                        {s.label}
                      </text>
                    </>
                  ) : (
                    <>
                      <line x1={x1} y1={y} x2={xe} y2={y} stroke={col} strokeWidth={active ? 2 : 1.5} markerEnd={frac > 0.95 ? `url(#life-arr-${col.slice(1)})` : undefined} />
                      {active && frac < 1 && <circle cx={xe} cy={y} r={4} fill={col} />}
                      <text x={(x1 + x2) / 2} y={y - 5} fontSize={10.5} textAnchor="middle" fill={col} fontFamily="ui-monospace,monospace">
                        {s.msg}
                      </text>
                      <text x={(x1 + x2) / 2} y={y + 12} fontSize={9.5} textAnchor="middle" fill={active ? "#e7e9f0" : "#5a6275"}>
                        {s.label.length > Math.abs(x2 - x1) / 5.2 ? s.label.slice(0, Math.floor(Math.abs(x2 - x1) / 5.2) - 1) + "…" : s.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </Panel>

        <div className="min-w-0 space-y-3">
          <Panel title={`Step ${cur + 1} · ${step.msg ?? "action"}`}>
            <div className={clsx("text-sm font-medium", step.tone === "bad" ? "text-bad" : step.tone === "ok" ? "text-ok" : "text-ink")}>{step.label}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.note}</p>
          </Panel>
          <Panel title="Balances right now">
            <div className="space-y-2 font-mono text-xs">
              <div className="text-[11px] tracking-wide text-faint uppercase">Conta PI (central bank money)</div>
              <Row label="PSP A available (SADP)" v={brl(step.ledger.aAvail)} />
              <Row label="PSP A blocked (SABK)" v={brl(step.ledger.aBlocked)} hl={step.ledger.aBlocked > 0} />
              <Row label="PSP B available" v={brl(step.ledger.bAvail)} />
              <div className="pt-1 text-[11px] tracking-wide text-faint uppercase">Customer accounts (PSP books)</div>
              <Row label="payer balance" v={brl(step.ledger.payer)} />
              <Row label="payer held" v={brl(step.ledger.payerHeld)} hl={step.ledger.payerHeld > 0} />
              <Row label="payee balance" v={brl(step.ledger.payee)} />
              <Row label="payee provisional" v={brl(step.ledger.payeeProvisional)} hl={step.ledger.payeeProvisional > 0} />
            </div>
          </Panel>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="finality t4" value={t4 !== null ? sec(t4) : "never"} tone={t4 !== null ? (t4 < LIMIT_MS ? "good" : "bad") : "bad"} hint="limit t0′ + 40 s" />
            <Stat label="payer sees t6a" value={t6 !== null ? sec(t6) : "—"} tone={failed ? "bad" : t6 !== null && t6 <= 10_000 ? "good" : "warn"} hint="SLA P99 10 s" />
          </div>
        </div>
      </div>

      <Panel
        title="Latency budget per hop (from t0′)"
        right={<Segmented value={zoom} onChange={setZoom} options={[{ value: "12", label: "0–12 s" }, { value: "45", label: "0–45 s" }]} />}
      >
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          <Slider label="Payer PSP (t1−t0′)" value={b.payer} min={100} max={36_000} step={100} onChange={(v) => setBudget({ payer: v })} format={(v) => `${(v / 1000).toFixed(1)} s`} />
          <Slider label="Payee PSP (t3′−t2)" value={b.receiver} min={100} max={42_000} step={100} onChange={(v) => setBudget({ receiver: v })} format={(v) => `${(v / 1000).toFixed(1)} s`} />
          <Slider label="SPI inbound (t2−t1)" value={b.spiIn} min={100} max={4_000} step={50} onChange={(v) => setBudget({ spiIn: v })} format={(v) => `${(v / 1000).toFixed(2)} s`} />
          <Slider label="SPI outbound (t5a−t3′)" value={b.spiOut} min={100} max={4_000} step={50} onChange={(v) => setBudget({ spiOut: v })} format={(v) => `${(v / 1000).toFixed(2)} s`} />
        </div>
        <svg viewBox="0 0 760 74" className="mt-4 w-full">
          {segs.map((s) => {
            const x = 10 + (Math.min(acc, span) / span) * 740;
            acc += s.v;
            const x2 = 10 + (Math.min(acc, span) / span) * 740;
            return (
              <g key={s.label}>
                <rect x={x} y={14} width={Math.max(0, x2 - x)} height={22} fill={s.c} opacity={0.8} />
                {x2 - x > 60 && (
                  <text x={(x + x2) / 2} y={29} textAnchor="middle" fontSize={10} fill="#0a0c11">
                    {s.label}
                  </text>
                )}
              </g>
            );
          })}
          {[
            { at: 10_000, label: "10 s · payer-experience P99", c: "#f5a524" },
            { at: LIMIT_MS, label: "40 s · hard limit (AB03)", c: "#f87171" },
          ]
            .filter((m) => m.at <= span)
            .map((m) => {
              const x = 10 + (m.at / span) * 740;
              return (
                <g key={m.label}>
                  <line x1={x} x2={x} y1={6} y2={44} stroke={m.c} strokeDasharray="3 3" />
                  <text x={x - 4} y={56} fontSize={10} textAnchor="end" fill={m.c}>
                    {m.label}
                  </text>
                </g>
              );
            })}
          {Array.from({ length: zoom === "12" ? 13 : 10 }, (_, i) => {
            const v = zoom === "12" ? i * 1000 : i * 5000;
            const x = 10 + (v / span) * 740;
            return (
              <text key={i} x={x} y={70} fontSize={9} textAnchor="middle" fill="#5a6275">
                {v / 1000}s
              </text>
            );
          })}
        </svg>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          SLA ceilings in the Manual de Tempos do Pix v7.0: payer PSP initiation P50 0.9 s / P95 1.5 s; payee PSP authorization P50 1.4 s /
          P95 2.3 s; time inside the SPI P50 2.8 s / P99 4.6 s; payer experience P50 6 s / P99 10 s. Hard limits: t1−t0′ ≤ 34 s (else AB11)
          and t0′→t4 ≤ 40 s (else the SPI aborts with AB03). The DICT lookup happens before t0′ and has its own SLA (P99 1 s).
        </p>
      </Panel>
      <p className="text-xs text-faint">
        Try: press Play on the happy path and watch PSP A&apos;s Conta PI: the R$ 150 is blocked first and only moves at t4. Then drag the
        payee PSP to 39 s — the order now dies at t0′ + 40 s with AB03 and the hold is released. Switch to &quot;Conta PI empty&quot;: the
        payee PSP never even sees the payment.
      </p>
    </div>
  );
}

function Row({ label, v, hl }: { label: string; v: string; hl?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={clsx("tabular-nums", hl ? "text-warn" : "text-ink")}>{v}</span>
    </div>
  );
}
