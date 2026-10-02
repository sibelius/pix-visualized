"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { useTicker } from "@/lib/useTicker";
import { Check } from "./Field";
import { SequenceDiagram } from "./SequenceDiagram";
import { runFlow, SETTLEMENT_LIMIT, VALIDATION_LIMIT, type FlowParams } from "./flow";

const LANES = [
  { label: "Payer", sub: "usuário pagador" },
  { label: "Payer PSP", sub: "11223344" },
  { label: "SPI", sub: "00038166 · BCB" },
  { label: "Receiver PSP", sub: "55667788" },
  { label: "Receiver", sub: "usuário recebedor" },
];

export function FlowClock() {
  const [mode, setMode] = useState<FlowParams["mode"]>("PAGPRI");
  const [validation, setValidation] = useState(0.8);
  const [receiver, setReceiver] = useState(1.2);
  const [net, setNet] = useState(0.06);
  const [spi, setSpi] = useState(1.2);
  const [down, setDown] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clock = useRef(0);

  const r = useMemo(() => runFlow({ mode, validation, receiver, net, spi, receiverDown: down }), [mode, validation, receiver, net, spi, down]);
  const tk = useTicker(
    () => {
      clock.current += speed / 60;
      if (clock.current > r.end + 0.4) {
        clock.current = r.end + 0.4;
      }
    },
    { speed: 1 },
  );
  const now = clock.current;
  const finished = now >= r.end + 0.4;
  const { running, pause } = tk;
  useEffect(() => {
    if (running && finished) pause();
  }, [running, finished, pause]);
  const shown = r.events.filter((e) => e.t <= now + 1e-9).length;
  const reset = () => {
    clock.current = 0;
    tk.refresh();
  };
  const play = () => {
    if (clock.current >= r.end + 0.4) clock.current = 0;
    tk.toggle();
  };
  const skip = () => {
    clock.current = r.end + 0.4;
    tk.pause();
    tk.refresh();
  };

  const axisMax = Math.max(45, Math.ceil(r.end + 3));
  const W = 760;
  const X = (t: number) => Math.round(30 + (t / axisMax) * (W - 50));
  const done = now >= r.end;
  const zoom = Math.min(axisMax, Math.max(6, r.end + 0.5));
  const Z = (t: number) => Math.round(30 + (t / zoom) * (W - 50));

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={play}>
          {tk.running ? "Pause" : now > 0 && !done ? "Resume" : "Send Pix"}
        </Button>
        <Button onClick={reset}>Reset</Button>
        <Button variant="ghost" onClick={skip}>
          Skip to end
        </Button>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "PAGPRI", label: "HIGH · PAGPRI" },
            { value: "PAGFRD", label: "NORM · PAGFRD" },
          ]}
        />
        <Check label="receiver PSP is down" checked={down} onChange={setDown} />
        <Slider label="speed" value={speed} min={0.25} max={8} step={0.25} onChange={setSpeed} format={(v) => `${v}×`} className="min-w-40" />
      </Controls>
      <Controls>
        <Slider label="payer PSP validation t1−t0′" value={validation} min={0.1} max={40} step={0.1} onChange={setValidation} format={(v) => `${v.toFixed(1)} s`} className="min-w-64 flex-1" />
        <Slider label="receiver PSP t3′−t2" value={receiver} min={0.1} max={45} step={0.1} onChange={setReceiver} format={(v) => `${v.toFixed(1)} s`} className="min-w-64 flex-1" />
        <Slider label="SPI per leg" value={spi} min={0.2} max={4} step={0.1} onChange={setSpi} format={(v) => `${v.toFixed(1)} s`} className="min-w-52 flex-1" />
        <Slider label="network one-way" value={net} min={0.01} max={0.5} step={0.01} onChange={setNet} format={(v) => `${Math.round(v * 1000)} ms`} className="min-w-52 flex-1" />
      </Controls>

      <Panel
        title="Clock: seconds since t0′ (AccptncDtTm)"
        right={
          <span className={clsx("font-mono text-xs", done ? (r.outcome === "settled" ? "text-ok" : "text-bad") : "text-muted")}>
            {done ? (r.outcome === "settled" ? "settled ✓" : `RJCT ${r.outcome}`) : `t = ${now.toFixed(2)} s`}
          </span>
        }
      >
        <svg viewBox={`0 0 ${W} 56`} className="w-full" role="img" aria-label="timeline">
          <rect x={X(0)} y={30} width={X(axisMax) - X(0)} height={14} rx={3} fill="#171b24" />
          {mode === "PAGFRD" && <rect x={X(0)} y={30} width={X(r.events.find((e) => e.mark === "t1′")?.t ?? 0) - X(0)} height={14} fill="#fbbf24" opacity={0.15} />}
          <rect x={X(mode === "PAGPRI" ? 0 : (r.events.find((e) => e.mark === "t1′")?.t ?? 0))} y={30} width={Math.max(0, X(Math.min(now, r.deadline)) - X(mode === "PAGPRI" ? 0 : (r.events.find((e) => e.mark === "t1′")?.t ?? 0)))} height={14} rx={3} fill={CHAPTER_COLOR.spi} opacity={0.35} />
          {mode === "PAGPRI" && <line x1={X(VALIDATION_LIMIT)} x2={X(VALIDATION_LIMIT)} y1={26} y2={48} stroke="#fbbf24" strokeDasharray="2 2" />}
          {mode === "PAGPRI" && (
            <text x={X(VALIDATION_LIMIT) - 3} y={22} fontSize={9.5} fill="#fbbf24" textAnchor="end">
              34 s validation limit
            </text>
          )}
          <line x1={X(r.deadline)} x2={X(r.deadline)} y1={22} y2={52} stroke="#f87171" strokeWidth={2} />
          <text x={X(r.deadline) + 3} y={20} fontSize={9.5} fill="#f87171">
            {SETTLEMENT_LIMIT} s limit
          </text>
          <line x1={X(Math.min(now, axisMax))} x2={X(Math.min(now, axisMax))} y1={26} y2={48} stroke="#e7e9f0" strokeWidth={2} />
          {[0, 10, 20, 30, 40].map((s) => (
            <text key={s} x={X(s)} y={12} fontSize={9} fill="#5a6275" textAnchor="middle">
              {s}s
            </text>
          ))}
        </svg>
        <svg viewBox={`0 0 ${W} 64`} className="mt-1 w-full" role="img" aria-label="zoomed timeline">
          <text x={30} y={10} fontSize={9.5} fill="#5a6275">
            zoom: 0 – {zoom.toFixed(1)} s
          </text>
          <line x1={Z(0)} x2={Z(zoom)} y1={26} y2={26} stroke="#242a38" strokeWidth={6} strokeLinecap="round" />
          <line x1={Z(0)} x2={Z(Math.min(now, zoom))} y1={26} y2={26} stroke={CHAPTER_COLOR.spi} strokeWidth={6} strokeLinecap="round" opacity={0.6} />
          {r.marks.map((m, i) => (
            <g key={i} opacity={m.t <= now ? 1 : 0.35}>
              <line x1={Z(Math.min(m.t, zoom))} x2={Z(Math.min(m.t, zoom))} y1={18} y2={36} stroke={m.tone === "bad" ? "#f87171" : "#e7e9f0"} />
              <text x={Z(Math.min(m.t, zoom))} y={48 + (i % 2) * 12} fontSize={10} textAnchor="middle" fill={m.tone === "bad" ? "#f87171" : "#8a93a8"} fontFamily="var(--font-mono)">
                {m.label}
              </text>
            </g>
          ))}
        </svg>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Panel title="Settlement cycle between two direct participants (Manual de Fluxos §3.1.1)">
          <SequenceDiagram
            lanes={LANES}
            color={CHAPTER_COLOR.spi}
            events={r.events.map((e) => ({ ...e, time: `${e.t.toFixed(2)}s` }))}
            shown={shown}
            active={shown - 1}
          />
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
          <Stat
            label="t4 − t0′ (to finality)"
            value={r.total !== undefined ? `${r.total.toFixed(2)} s` : "—"}
            tone={r.outcome === "settled" ? "good" : "bad"}
            hint={`limit ${SETTLEMENT_LIMIT} s, then RJCT AB03`}
          />
          <Stat
            label="receiver t3′ − t2"
            value={r.receiverTime !== undefined ? `${r.receiverTime.toFixed(2)} s` : down ? "∞" : `${receiver.toFixed(1)} s`}
            tone={receiver > 2.3 || down ? (r.outcome === "AB03" ? "bad" : "warn") : "good"}
            hint="ANS p50 1.4 s · p95 2.3 s"
          />
          <Stat label="time in the SPI" value={r.spiTime !== undefined ? `${r.spiTime.toFixed(2)} s` : "—"} tone={r.spiTime !== undefined && r.spiTime > 4.6 ? "warn" : "neutral"} hint="(t2−t1′)+(t5a−t3′) · p50 2.8 · p99 4.6 s" />
          <Stat label="payer experience t6a − t0′" value={r.payerExperience !== undefined ? `${r.payerExperience.toFixed(2)} s` : "—"} tone={r.payerExperience !== undefined && r.payerExperience > 10 ? "warn" : "neutral"} hint="ANS p50 6 s · p99 10 s" />
          <Stat label="payer PSP t1 − t0′" value={`${validation.toFixed(1)} s`} tone={validation > VALIDATION_LIMIT && mode === "PAGPRI" ? "bad" : validation > 1.5 ? "warn" : "good"} hint="ANS p50 0.9 s · p95 1.5 s" />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: drag the receiver latency past ~37 s and press Send Pix: the SPI waits until the 40 s mark, releases the reserve and sends RJCT AB03 to both sides. A late ACSP
        changes nothing. Now switch to NORM · PAGFRD with a 30 s validation (an anti-fraud hold): the clock only starts when the SPI receives the order, so the same latencies
        settle. Back on HIGH, push validation past 34 s and the SPI refuses at once with AB11.
      </p>
    </div>
  );
}
