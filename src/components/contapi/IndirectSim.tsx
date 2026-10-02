"use client";

import { useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { fmt } from "@/lib/random";
import { IND_COLORS, IND_NAMES, hhmm, simulateIndirect } from "./model";

const W = 760;
const H = 280;
const PAD = { l: 48, r: 12, t: 14, b: 30 };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function IndirectSim() {
  const [n, setN] = useState(3);
  const [ownBuffer, setOwnBuffer] = useState(20);
  const [prefund, setPrefund] = useState(6);
  const [surge, setSurge] = useState(4);
  const [enforce, setEnforce] = useState<"off" | "on">("off");
  const [seed, setSeed] = useState(3);
  const res = useMemo(() => simulateIndirect({ n, ownBuffer, prefund, surge, enforce: enforce === "on", seed }), [n, ownBuffer, prefund, surge, enforce, seed]);

  const all = res.pts.flatMap((p) => [p.conta, ...p.pos]);
  const yMax = Math.max(1, ...all) * 1.08;
  const yMin = Math.min(0, ...all) * 1.08;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const X = (t: number) => r1(PAD.l + (t / 1440) * iw);
  const Y = (v: number) => r1(PAD.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih);
  const line = (vals: number[]) => res.pts.map((p, i) => `${i ? "L" : "M"}${X(p.t)},${Y(vals[i])}`).join("");
  const k = n + 1;
  const totalSpi = res.spiRej.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <Controls>
        <Slider label="indirect participants" value={n} min={1} max={4} step={1} onChange={setN} className="min-w-52 flex-1" />
        <Slider label="provider's own buffer" value={ownBuffer} min={0} max={60} step={1} onChange={setOwnBuffer} format={(v) => `R$${v}M`} className="min-w-56 flex-1" />
        <Slider label="each indirect's prefunding" value={prefund} min={0} max={30} step={1} onChange={setPrefund} format={(v) => `R$${v}M`} className="min-w-60 flex-1" />
      </Controls>
      <Controls>
        <Slider label="Indirect B outflow from 14:00" value={surge} min={1} max={10} step={0.5} onChange={setSurge} format={(v) => `×${v}`} className="min-w-60 flex-1" />
        <span className="inline-flex items-center gap-2 text-muted">
          provider gates each indirect by its position
          <Segmented value={enforce} onChange={setEnforce} options={[{ value: "off", label: "off" }, { value: "on", label: "on" }]} />
        </span>
        <Button onClick={() => setSeed((s) => s + 1)}>New noise</Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
        <Panel title="A Saturday: one Conta PI, several institutions (R$ M)">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
            <rect x={X(840)} y={PAD.t} width={r1(X(1440) - X(840))} height={ih} fill="#f87171" opacity={0.05} />
            {[0, 6, 12, 18, 24].map((h) => (
              <g key={h}>
                <line x1={X(h * 60)} x2={X(h * 60)} y1={PAD.t} y2={PAD.t + ih} stroke="#242a38" strokeDasharray="2 3" />
                <text x={X(h * 60)} y={H - 10} fontSize={10.5} textAnchor="middle" fill="#5a6275">
                  {String(h).padStart(2, "0")}:00
                </text>
              </g>
            ))}
            {[yMin, 0, yMax / 2, yMax].map((v, i) => (
              <text key={i} x={PAD.l - 6} y={Y(v) + 3.5} fontSize={10} textAnchor="end" fill="#5a6275">
                {fmt(v, 0)}
              </text>
            ))}
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(0)} y2={Y(0)} stroke="#5a6275" />
            <path d={line(res.pts.map((p) => p.conta))} fill="none" stroke="#e7e9f0" strokeWidth={2.2} />
            {Array.from({ length: k }, (_, i) => (
              <path key={i} d={line(res.pts.map((p) => p.pos[i]))} fill="none" stroke={IND_COLORS[i]} strokeWidth={1.4} strokeDasharray={i === 0 ? "4 3" : undefined} />
            ))}
            <path
              d={`${line(res.pts.map((p) => -p.exposure))}L${X(1430)},${Y(0)}L${X(0)},${Y(0)}Z`}
              fill="#f87171"
              opacity={0.15}
            />
            <text x={X(850)} y={PAD.t + 12} fontSize={10} fill="#f87171">
              Indirect B surge →
            </text>
          </svg>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              <span className="mr-1 inline-block h-0.5 w-4 bg-ink align-middle" />
              Conta PI (shared)
            </span>
            {Array.from({ length: k }, (_, i) => (
              <span key={i}>
                <span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: IND_COLORS[i] }} />
                {IND_NAMES[i]} position
              </span>
            ))}
            <span className="text-bad">shaded red: provider exposure (indirect positions below zero)</span>
          </div>
        </Panel>
        <div className="grid content-start gap-2">
          <Stat label="provider max exposure" value={`R$ ${fmt(res.maxExposure, 1)} M`} tone={res.maxExposure > 0.05 ? "bad" : "good"} hint={res.maxExposure > 0.05 ? `at ${hhmm(res.maxExposureAt)}` : "never lent intraday"} />
          <Stat label="AM04 at the SPI (everyone)" value={`R$ ${fmt(totalSpi, 1)} M`} tone={totalSpi > 0.05 ? "bad" : "good"} />
          {Array.from({ length: k }, (_, i) => (
            <div key={i} className="rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[12px]">
              <span style={{ color: IND_COLORS[i] }}>{IND_NAMES[i]}</span>
              <div className="font-mono text-[11px] text-muted">
                SPI AM04 {fmt(res.spiRej[i], 2)} M{i > 0 && ` · gated by provider ${fmt(res.provRej[i], 2)} M`}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: with gating off, push B’s surge to ×6. B’s position goes negative first (the provider is now lending to B), then the shared Conta PI hits zero and the
        provider’s own clients and A and C start getting AM04 too. Turn gating on: B is stopped inside the provider and nobody else notices.
      </p>
    </div>
  );
}
