"use client";

import { useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Hint } from "./shared";
import { CATEGORIES, HOPS, histogram, simulateBudget } from "./temposModel";

const COLORS = ["#fbbf24", "#818cf8", "#f472b6", "#a78bfa", "#32bcad"];
const MAX = 16;
const BINS = 64;

export function LatencyBudget() {
  const [medians, setMedians] = useState<number[]>(HOPS.map((h) => h.median));
  const [slow, setSlow] = useState(0);
  const [seed, setSeed] = useState(7);
  const [cat, setCat] = useState<"A" | "B" | "C" | "D">("A");
  const [down, setDown] = useState(120);

  const hops = HOPS.map((h, i) => ({ ...h, median: medians[i], tail: (h.tail / h.median) * medians[i] }));
  const sim = useMemo(() => simulateBudget(hops, 3000, seed, slow), [medians, seed, slow]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = histogram(sim.totals, MAX, BINS);
  const hmax = Math.max(...hist, 1);
  const X = (s: number) => Math.round(40 + (s / MAX) * 580);
  const budget = medians.reduce((a, b) => a + b, 0);
  const target = CATEGORIES.find((c) => c.c === cat)!.target;
  const minutes = 30 * 24 * 60;
  const idx = ((minutes - down) / minutes) * 100;
  const allowed = Math.round(minutes * (1 - target / 100));

  return (
    <div className="space-y-4">
      <Controls>
        {HOPS.map((h, i) => (
          <Slider
            key={h.key}
            label={<span style={{ color: COLORS[i] }}>{h.span}</span>}
            value={medians[i]}
            min={0.1}
            max={6}
            step={0.1}
            onChange={(v) => setMedians(medians.map((m, j) => (j === i ? v : m)))}
            format={(v) => `${v.toFixed(1)} s`}
            className="min-w-48 flex-1"
          />
        ))}
      </Controls>
      <Controls>
        <Slider label="receiver PSP stalls (8–45 s) on" value={slow} min={0} max={5} step={0.1} onChange={setSlow} format={(v) => `${v.toFixed(1)}%`} className="min-w-64 flex-1" />
        <Button onClick={() => setSeed((s) => s + 1)}>Resample</Button>
        <Button variant="ghost" onClick={() => { setMedians(HOPS.map((h) => h.median)); setSlow(0); }}>
          Reset to the ANS medians
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="3,000 simulated Pix: t6a − t0' (what the payer feels)">
          <svg viewBox="0 0 640 230" className="w-full">
            {/* budget bar */}
            {(() => {
              let acc = 0;
              return HOPS.map((h, i) => {
                const x1 = X(acc);
                acc += medians[i];
                return (
                  <g key={h.key}>
                    <rect x={x1} y={8} width={Math.max(1, X(Math.min(acc, MAX)) - x1)} height={16} fill={COLORS[i]} opacity={0.8} />
                  </g>
                );
              });
            })()}
            <text x={X(Math.min(budget, MAX)) + 4} y={20} fontSize={10} fill="#8a93a8">
              sum of medians {budget.toFixed(1)} s
            </text>
            {hist.map((c, i) => {
              const h = Math.round((c / hmax) * 150);
              return <rect key={i} x={X((i * MAX) / BINS)} y={190 - h} width={Math.max(1, X(MAX / BINS) - X(0) - 1)} height={h} fill="#32bcad" opacity={0.75} />;
            })}
            {[
              { s: 6, l: "p50 target 6 s" },
              { s: 10, l: "p99 target 10 s" },
            ].map((m) => (
              <g key={m.s}>
                <line x1={X(m.s)} y1={36} x2={X(m.s)} y2={190} stroke="#fbbf24" strokeDasharray="4 3" />
                <text x={X(m.s) + 3} y={46} fontSize={9.5} fill="#fbbf24">
                  {m.l}
                </text>
              </g>
            ))}
            <line x1={X(sim.p99 > MAX ? MAX : sim.p99)} y1={36} x2={X(sim.p99 > MAX ? MAX : sim.p99)} y2={190} stroke={sim.p99 <= 10 ? "#34d399" : "#f87171"} />
            <line x1={40} y1={190} x2={620} y2={190} stroke="#242a38" />
            {[0, 2, 4, 6, 8, 10, 12, 14, 16].map((s) => (
              <text key={s} x={X(s)} y={204} fontSize={9.5} textAnchor="middle" fill="#5a6275">
                {s === 16 ? "16+ s" : `${s}`}
              </text>
            ))}
            <text x={330} y={222} fontSize={9.5} textAnchor="middle" fill="#5a6275">
              seconds from user confirmation to receipt on screen (anything above 40 s is rejected by the SPI)
            </text>
          </svg>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {HOPS.map((h, i) => (
              <span key={h.key} className="text-muted">
                <span className="mr-1 inline-block size-2 rounded-sm" style={{ background: COLORS[i] }} />
                <span className="font-mono">{h.span}</span> {h.label} · <span className="text-faint">{h.target}</span>
              </span>
            ))}
          </div>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="p50" value={`${sim.p50.toFixed(2)} s`} tone={sim.p50 <= 6 ? "good" : "bad"} hint="ANS ≤ 6.0 s" />
            <Stat label="p99" value={`${sim.p99.toFixed(2)} s`} tone={sim.p99 <= 10 ? "good" : "bad"} hint="ANS ≤ 10.0 s" />
            <Stat label="timed out" value={sim.timeouts} tone={sim.timeouts ? "bad" : "neutral"} hint="> 40 s (canal primário)" />
            <Stat label="DICT lookup" value="before t0'" hint="own ANS: p99 2 s user-side, 1 s in DICT" />
          </div>
          <p className="text-xs leading-relaxed text-faint">
            Each hop is lognormal, fitted to its published median and tail. The SPI&apos;s published total, (t2 − t1&apos;) + (t5a − t3&apos;), is split evenly over its two
            hops. Scheduled Pix on the <em>canal secundário</em> have a 45-minute limit and a 15-minute p99 SPI target instead. A fraud-suspect Pix can be held 30 min
            (8h–20h on business days) or 60 min otherwise.
          </p>
        </div>
      </div>
      <Panel title="Availability: how many minutes of outage a month buys you">
        <Controls className="mb-3 border-0 bg-transparent px-0 py-0">
          <Segmented value={cat} onChange={setCat} options={CATEGORIES.map((c) => ({ value: c.c, label: `cat. ${c.c}` }))} />
          <Slider label="outage this month" value={down} min={0} max={2400} step={10} onChange={setDown} format={(v) => `${v} min`} className="min-w-64 flex-1" />
        </Controls>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={`cat. ${cat} target`} value={`${target}%`} hint={CATEGORIES.find((c) => c.c === cat)!.share} />
          <Stat label="budget (30 days)" value={`${allowed} min`} />
          <Stat label="your index" value={`${idx.toFixed(2)}%`} tone={idx >= target ? "good" : "bad"} />
          <Stat label="BCB side" value="99.9%" hint="SPI; DICT 99.9% lookups / 99.8% updates" />
        </div>
        <p className="mt-2 text-xs text-faint">
          id = hf ÷ hp over 24×7. Outages caused by the SPI, DICT or RSFN, or by the user&apos;s phone, don&apos;t count against the participant; outages at its PSTI or
          settlement agent do. Indicators feed the monthly IGA = CA − DR, where level-1 indicators weigh double and repeat misses subtract 1% (level 1) or 0.5% (level 2).
        </p>
      </Panel>
      <Hint>raise the receiver hop to 3 s and the p99 crosses 10 s even though every median looks fine. Or keep the medians and let 1% of receivers stall: the p50 doesn&apos;t move, the p99 and the timeouts do.</Hint>
    </div>
  );
}
