"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { fmt } from "@/lib/random";
import { DAYS, WEEK_MIN, isBusiness, simulateWeek, weekLabel, type WeekParams } from "./model";

const W = 760;
const H = 300;
const PAD = { l: 52, r: 12, t: 22, b: 40 };
const r1 = (v: number) => Math.round(v * 10) / 10;
const brl = (m: number) => (Math.abs(m) >= 1000 ? `R$ ${fmt(m / 1000, 2)} bi` : `R$ ${fmt(m, m < 10 ? 1 : 0)} M`);

export function LiquidityWeek() {
  const [peak, setPeak] = useState(40);
  const [imb, setImb] = useState(0.06);
  const [target, setTarget] = useState(60);
  const [buffer, setBuffer] = useState(160);
  const [minOp, setMinOp] = useState(0);
  const [autoBlock, setAutoBlock] = useState<"on" | "off">("off");
  const [unblockAfter, setUnblockAfter] = useState(45);
  const [holiday, setHoliday] = useState<"no" | "yes">("no");
  const [sweep, setSweep] = useState<"on" | "off">("off");
  const [seed, setSeed] = useState(7);
  const [cursor, setCursor] = useState(WEEK_MIN);

  const p: WeekParams = {
    peak,
    imb,
    target,
    buffer,
    minOp,
    autoBlock: autoBlock === "on",
    unblockAfter,
    holidayMonday: holiday === "yes",
    sweep: sweep === "on",
    seed,
  };
  const res = useMemo(() => simulateWeek(p), [peak, imb, target, buffer, minOp, autoBlock, unblockAfter, holiday, sweep, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const tk = useTicker(
    () => {
      setCursor((c) => (c >= WEEK_MIN ? 0 : Math.min(WEEK_MIN, c + 30)));
    },
    { speed: 1 },
  );
  const { pause } = tk;
  useEffect(() => {
    if (cursor >= WEEK_MIN) pause();
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxBal = Math.max(target + buffer, ...res.points.map((q) => q.bal)) * 1.08;
  const minY = Math.min(0, minOp);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const X = (t: number) => r1(PAD.l + (t / WEEK_MIN) * iw);
  const Y = (v: number) => r1(PAD.t + ih - ((v - minY) / (maxBal - minY || 1)) * ih);

  const shown = res.points.filter((q) => q.t <= cursor);
  const path = shown.map((q, i) => `${i ? "L" : "M"}${X(q.t)},${Y(q.bal)}`).join("");
  const maxRej = Math.max(0.001, ...res.rejByHour.map((r) => r.value));
  const rejShown = res.rejByHour.filter((r) => r.t <= cursor);
  const rejTotalShown = rejShown.reduce((a, b) => a + b.value, 0);
  const trShown = res.transfers.filter((t) => t.t <= cursor);
  const avgTicket = 250; // R$
  const rejCount = (res.rejectedValue * 1e6) / avgTicket;

  // weekend gap: last STR close before the closure → next STR open
  const lastClose = 4 * 1440 + 1140;
  const nextOpen = (holiday === "yes" ? 8 : 7) * 1440 + 390;

  const ticks: number[] = [];
  for (let d = 0; d <= 8; d++) ticks.push(d * 1440);
  const yTicks = niceTicks(minY, maxBal);

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={() => (cursor >= WEEK_MIN ? (setCursor(0), tk.play()) : tk.toggle())}>
          {tk.running ? "Pause" : cursor >= WEEK_MIN ? "Replay the week" : "Play"}
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Another week (new noise)</Button>
        <span className="inline-flex items-center gap-2 text-muted">
          next Monday is a holiday
          <Segmented value={holiday} onChange={setHoliday} options={[{ value: "no", label: "no" }, { value: "yes", label: "yes" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          sweep excess at 18:20
          <Segmented value={sweep} onChange={setSweep} options={[{ value: "off", label: "off" }, { value: "on", label: "on" }]} />
        </span>
      </Controls>
      <Controls>
        <Slider label="peak gross outflow" value={peak} min={5} max={150} step={1} onChange={setPeak} format={(v) => `R$${v}M/h`} className="min-w-60 flex-1" />
        <Slider
          label="net imbalance"
          value={imb}
          min={-0.2}
          max={0.3}
          step={0.01}
          onChange={setImb}
          format={(v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}% out`}
          className="min-w-60 flex-1"
        />
        <Slider label="target balance" value={target} min={5} max={400} step={5} onChange={setTarget} format={(v) => `R$${v}M`} className="min-w-60 flex-1" />
        <Slider label="closure pre-funding" value={buffer} min={0} max={800} step={10} onChange={setBuffer} format={(v) => `+R$${v}M`} className="min-w-60 flex-1" />
      </Controls>
      <Controls>
        <Slider label="limite mínimo de saldo operacional" value={minOp} min={0} max={100} step={5} onChange={setMinOp} format={(v) => `R$${v}M`} className="min-w-72 flex-1" />
        <span className="inline-flex items-center gap-2 text-muted">
          bloqueio automático
          <Segmented value={autoBlock} onChange={setAutoBlock} options={[{ value: "off", label: "off" }, { value: "on", label: "on" }]} />
        </span>
        <Slider label="treasury unblocks after" value={unblockAfter} min={5} max={240} step={5} onChange={setUnblockAfter} format={(v) => `${v} min`} className="min-w-60 flex-1" />
      </Controls>

      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <Panel title="Conta PI balance, Monday 00:00 → Tuesday (Brasília time)" right={<span className="font-mono text-xs text-muted">{weekLabel(Math.min(cursor, WEEK_MIN - 1))}</span>}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
            {/* STR windows */}
            {DAYS.map((_, d) =>
              isBusiness(d, holiday === "yes") ? (
                <g key={d}>
                  <rect x={X(d * 1440 + 390)} y={PAD.t} width={r1(X(d * 1440 + 1110) - X(d * 1440 + 390))} height={ih} fill="#32bcad" opacity={0.09} />
                  <rect x={X(d * 1440 + 1110)} y={PAD.t} width={r1(X(d * 1440 + 1140) - X(d * 1440 + 1110))} height={ih} fill="#fbbf24" opacity={0.18} />
                </g>
              ) : (
                <text key={d} x={X(d * 1440 + 720)} y={PAD.t + 12} fontSize={10} textAnchor="middle" fill="#f87171">
                  {d === 7 ? "holiday: STR closed" : "STR closed"}
                </text>
              ),
            )}
            {/* weekend gap arrow */}
            <line x1={X(lastClose)} x2={X(nextOpen)} y1={PAD.t - 8} y2={PAD.t - 8} stroke="#f87171" strokeWidth={1} />
            <text x={r1((X(lastClose) + X(nextOpen)) / 2)} y={PAD.t - 11} fontSize={10} textAnchor="middle" fill="#f87171">
              {Math.round((nextOpen - lastClose) / 60)} h with no way to add liquidity
            </text>
            {/* blocks */}
            {res.blocks
              .filter((b) => b.from <= cursor)
              .map((b, i) => (
                <rect key={i} x={X(b.from)} y={PAD.t} width={Math.max(1, r1(X(Math.min(b.to, cursor)) - X(b.from)))} height={ih} fill="#f87171" opacity={0.18} />
              ))}
            {/* grid */}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} stroke="#242a38" />
                <text x={PAD.l - 6} y={Y(v) + 3.5} fontSize={10} textAnchor="end" fill="#5a6275">
                  {v >= 1000 ? `${fmt(v / 1000, 1)}bi` : `${fmt(v)}M`}
                </text>
              </g>
            ))}
            {ticks.map((t, i) => (
              <g key={t}>
                <line x1={X(t)} x2={X(t)} y1={PAD.t} y2={PAD.t + ih} stroke="#242a38" strokeDasharray="2 3" />
                {i < 8 && (
                  <text x={X(t + 720)} y={H - PAD.b + 15} fontSize={10.5} textAnchor="middle" fill={isBusiness(i, holiday === "yes") ? "#8a93a8" : "#f87171"}>
                    {DAYS[i]}
                  </text>
                )}
              </g>
            ))}
            {/* target + min op limit */}
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(target)} y2={Y(target)} stroke="#8a93a8" strokeDasharray="5 4" />
            <text x={W - PAD.r - 2} y={Y(target) - 3} fontSize={9.5} textAnchor="end" fill="#8a93a8">
              target
            </text>
            {minOp > 0 && (
              <>
                <line x1={PAD.l} x2={W - PAD.r} y1={Y(minOp)} y2={Y(minOp)} stroke="#fbbf24" strokeDasharray="3 3" />
                <text x={W - PAD.r - 2} y={Y(minOp) - 3} fontSize={9.5} textAnchor="end" fill="#fbbf24">
                  min operational limit
                </text>
              </>
            )}
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(0)} y2={Y(0)} stroke="#5a6275" />
            {/* balance */}
            <path d={path} fill="none" stroke="#e879f9" strokeWidth={1.6} />
            {/* rejections per hour */}
            {rejShown.map((r) => {
              const hgt = r1(8 + (r.value / maxRej) * 34);
              return <rect key={r.t} x={X(r.t)} y={r1(PAD.t + ih - hgt)} width={Math.max(1.5, r1(X(60) - X(0)))} height={hgt} fill="#f87171" opacity={0.85} />;
            })}
            {/* transfers */}
            {trShown.map((t, i) => (
              <path
                key={i}
                d={
                  t.kind !== "LPI0003"
                    ? `M${X(t.t)},${PAD.t + ih + 4} l-3.5,6 h7 z`
                    : `M${X(t.t)},${PAD.t + ih + 10} l-3.5,-6 h7 z`
                }
                fill={t.kind === "LPI0003" ? "#fbbf24" : t.kind === "LPI0006" ? "#38bdf8" : "#34d399"}
              />
            ))}
            {cursor < WEEK_MIN && <line x1={X(cursor)} x2={X(cursor)} y1={PAD.t} y2={PAD.t + ih} stroke="#e7e9f0" strokeWidth={1} />}
            <text x={PAD.l} y={H - 6} fontSize={9.5} fill="#5a6275">
              teal: STR 06:30–18:30 · amber: aporte-only window to 19:00 · ▲ LPI0001 aporte · ▲(blue) LPI0006 automatic aporte · ▼ LPI0003 retirada · red bars: AM04 rejections
            </text>
          </svg>
        </Panel>
        <div className="grid content-start gap-2">
          <Stat label="rejected (AM04)" value={brl(rejTotalShown)} tone={rejTotalShown > 0 ? "bad" : "good"} hint={`≈ ${fmt(cursor >= WEEK_MIN ? rejCount : (rejTotalShown * 1e6) / avgTicket)} Pix at R$${avgTicket} avg`} />
          <Stat label="lowest balance" value={brl(res.minBal)} tone={res.minBal <= minOp + 0.01 ? "bad" : res.minBal < target * 0.3 ? "warn" : "good"} hint={`at ${weekLabel(res.minBalAt)}`} />
          <Stat label="STR transfers" value={`${trShown.length}`} hint={`aportes ${brl(res.aportes)} · retiradas ${brl(res.retiradas)}`} />
          <Stat label="account blocked" value={`${fmt(res.blockedMinutes)} min`} tone={res.blockedMinutes ? "bad" : "neutral"} hint="all outgoing Pix rejected; incoming still credited" />
        </div>
      </div>
      <Panel title="STR / SPI event log" bodyClassName="max-h-44 overflow-auto font-mono text-[11.5px] leading-relaxed">
        {trShown.length === 0 && rejShown.length === 0 && <div className="text-faint">Press Play.</div>}
        {[...trShown.map((t) => ({ t: t.t, s: `${t.kind} ${t.kind === "LPI0003" ? "Conta PI → Reservas" : "Reservas → Conta PI"} ${brl(t.amount)} (${t.why})`, c: t.kind === "LPI0003" ? "text-warn" : t.kind === "LPI0006" ? "text-info" : "text-ok" })),
          ...rejShown.map((r) => ({ t: r.t, s: `pacs.002 RJCT AM04 × ≈${fmt((r.value * 1e6) / avgTicket)} (R$ ${fmt(r.value, 2)} M) in this hour`, c: "text-bad" })),
          ...res.blocks.filter((b) => b.from <= cursor).map((b) => ({ t: b.from, s: `Conta PI auto-blocked (art. 26-A): every pending order rejected until manual unblock in SPB-Web`, c: "text-bad" }))]
          .sort((a, b) => b.t - a.t)
          .slice(0, 80)
          .map((e, i) => (
            <div key={i} className={e.c}>
              <span className="text-faint">{weekLabel(e.t)}</span> {e.s}
            </div>
          ))}
      </Panel>
      <p className="text-xs text-faint">
        Try: with the defaults, set the closure pre-funding to 0 and press Play. The balance drifts down all Saturday and Sunday and payments start bouncing with AM04,
        because nothing can be added until Monday 06:30. Then make Monday a holiday, and finally set a minimum operational limit with automatic blocking on.
      </p>
    </div>
  );
}

function niceTicks(min: number, max: number) {
  const span = max - min || 1;
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}
