"use client";

import { useState, type MouseEvent } from "react";
import { Panel, Segmented, Stat } from "@/components/ui";
import { rng } from "@/lib/random";
import { ANNUAL, MONTHLY, RECORDS, type Point } from "./growth";

const W = 760;
const H = 330;
const PAD = { l: 56, r: 24, t: 24, b: 44 };
const HAND = "'Segoe Print','Bradley Hand','Comic Sans MS','Chalkboard SE',cursive";
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A wobbly line from a to b: two control points jittered perpendicular to the segment. */
function roughSeg(x1: number, y1: number, x2: number, y2: number, seed: number, amp = 3.4) {
  const r = rng(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const j = () => (r.next() - 0.5) * 2 * amp;
  const c1 = [x1 + dx * 0.3 + nx * j(), y1 + dy * 0.3 + ny * j()];
  const c2 = [x1 + dx * 0.7 + nx * j(), y1 + dy * 0.7 + ny * j()];
  return `M${r1(x1 + j() * 0.3)},${r1(y1 + j() * 0.3)} C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${r1(x2 + j() * 0.3)},${r1(y2 + j() * 0.3)}`;
}

function RoughPolyline({ pts, color, seed, width = 2 }: { pts: [number, number][]; color: string; seed: number; width?: number }) {
  const d1 = pts.slice(1).map((p, i) => roughSeg(pts[i][0], pts[i][1], p[0], p[1], seed + i * 7)).join(" ");
  const d2 = pts.slice(1).map((p, i) => roughSeg(pts[i][0], pts[i][1], p[0], p[1], seed + 1000 + i * 13, 4.5)).join(" ");
  return (
    <g fill="none" stroke={color} strokeLinecap="round">
      <path d={d1} strokeWidth={width} />
      <path d={d2} strokeWidth={width * 0.6} opacity={0.55} />
    </g>
  );
}

function RoughCircle({ cx, cy, rad, color, seed, filled }: { cx: number; cy: number; rad: number; color: string; seed: number; filled?: boolean }) {
  const r = rng(seed);
  const n = 10;
  const pts = Array.from({ length: n + 2 }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const rr = rad * (1 + (r.next() - 0.5) * 0.35);
    return `${r1(cx + Math.cos(a) * rr)},${r1(cy + Math.sin(a) * rr)}`;
  });
  return <path d={`M${pts.join(" L")}`} fill={filled ? color : "none"} fillOpacity={0.35} stroke={color} strokeWidth={1.4} />;
}

function RoughBar({ x, y, w, h, color, seed, dashed }: { x: number; y: number; w: number; h: number; color: string; seed: number; dashed?: boolean }) {
  const lines: string[] = [];
  const step = 7;
  for (let k = -h; k < w; k += step) {
    const xa = x + Math.max(0, k);
    const ya = y + h - Math.max(0, -k);
    const xb = x + Math.min(w, k + h);
    const yb = y + h - Math.min(h, k + h);
    lines.push(roughSeg(xa, ya, xb, yb, seed + k, 1));
  }
  const box = [roughSeg(x, y + h, x, y, seed + 1), roughSeg(x, y, x + w, y, seed + 2), roughSeg(x + w, y, x + w, y + h, seed + 3), roughSeg(x + w, y + h, x, y + h, seed + 4)].join(" ");
  return (
    <g fill="none" stroke={color} strokeLinecap="round" strokeDasharray={dashed ? "5 4" : undefined}>
      <path d={lines.join(" ")} strokeWidth={1} opacity={0.6} />
      <path d={box} strokeWidth={1.8} />
    </g>
  );
}

type View = "records" | "monthly" | "annual";

export function GrowthChart() {
  const [view, setView] = useState<View>("records");
  const [hover, setHover] = useState<number | null>(null);
  const data: Point[] = view === "records" ? RECORDS : view === "monthly" ? MONTHLY : ANNUAL;
  const unit = view === "records" ? "M / day" : view === "monthly" ? "bn / month" : "bn / year";
  const xs = data.map((d) => d.x);
  const x0 = view === "annual" ? 2020.5 : Math.floor(Math.min(...xs) * 4) / 4 - 0.05;
  const x1 = view === "annual" ? 2025.5 : Math.max(...xs) + 0.1;
  const yMax = view === "records" ? 350 : view === "monthly" ? 8 : 90;
  const yMin = view === "records" ? 200 : 0;
  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const yTicks = view === "records" ? [200, 250, 300, 350] : view === "monthly" ? [0, 2, 4, 6, 8] : [0, 20, 40, 60, 80];
  const years = view === "annual" ? [2021, 2022, 2023, 2024, 2025] : [2024, 2025, 2026].filter((y) => y >= x0 && y <= x1);
  const color = view === "records" ? "#32bcad" : view === "monthly" ? "#818cf8" : "#f5a524";
  const h = hover !== null ? data[hover] : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    data.forEach((d, i) => {
      if (Math.abs(sx(d.x) - px) < Math.abs(sx(data[best].x) - px)) best = i;
    });
    setHover(best);
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={view}
        onChange={(v) => {
          setView(v);
          setHover(null);
        }}
        options={[
          { value: "records", label: "Daily records" },
          { value: "monthly", label: "Monthly volume" },
          { value: "annual", label: "Yearly totals" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel title={`Pix transactions · ${unit}`} bodyClassName="p-2 sm:p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {/* axes, hand-drawn */}
            <RoughPolyline pts={[[PAD.l, PAD.t - 6], [PAD.l, H - PAD.b], [W - PAD.r + 6, H - PAD.b]]} color="#5a6275" seed={3} width={1.4} />
            {yTicks.map((t, i) => (
              <g key={t}>
                <path d={roughSeg(PAD.l, sy(t), W - PAD.r, sy(t), 50 + i, 1.2)} stroke="#242a38" fill="none" strokeDasharray="2 6" />
                <text x={PAD.l - 8} y={sy(t) + 4} fontSize={12} textAnchor="end" fill="#8a93a8" fontFamily={HAND}>
                  {t}
                </text>
              </g>
            ))}
            {years.map((y) => (
              <text key={y} x={sx(view === "annual" ? y : y + 0.02)} y={H - PAD.b + 20} fontSize={12} textAnchor={view === "annual" ? "middle" : "start"} fill="#8a93a8" fontFamily={HAND}>
                {y}
              </text>
            ))}
            {view === "annual" ? (
              data.map((d, i) => {
                const bw = 70;
                return (
                  <g key={d.label}>
                    <RoughBar x={sx(d.x) - bw / 2} y={sy(d.v)} w={bw} h={sy(0) - sy(d.v)} color={color} seed={100 + i * 31} dashed={d.approx} />
                    <text x={sx(d.x)} y={sy(d.v) - 8} textAnchor="middle" fontSize={13} fill="#e7e9f0" fontFamily={HAND}>
                      {d.approx ? "≈" : ""}
                      {d.v}
                    </text>
                  </g>
                );
              })
            ) : (
              <>
                <RoughPolyline pts={data.map((d) => [sx(d.x), sy(d.v)])} color={color} seed={view === "records" ? 11 : 17} />
                {data.map((d, i) => (
                  <RoughCircle key={d.label} cx={sx(d.x)} cy={sy(d.v)} rad={hover === i ? 6 : view === "records" ? 4.5 : 2.6} color={d.approx ? "#f5a524" : color} seed={300 + i} filled={!d.approx} />
                ))}
                {view === "records" && (
                  <>
                    <path d={roughSeg(sx(2025.93) + 6, sy(313.34) - 8, sx(2025.6), sy(338), 7, 2)} stroke="#e7e9f0" strokeWidth={1.2} fill="none" />
                    <text x={sx(2025.6) - 6} y={sy(338) - 2} textAnchor="end" fontSize={13} fill="#e7e9f0" fontFamily={HAND}>
                      313.3 M on 5 Dec 2025 (official)
                    </text>
                  </>
                )}
              </>
            )}
            {h && (
              <line x1={sx(h.x)} x2={sx(h.x)} y1={PAD.t} y2={H - PAD.b} stroke="#5a6275" strokeDasharray="3 3" />
            )}
            <text x={W - PAD.r} y={PAD.t + 4} textAnchor="end" fontSize={11} fill="#5a6275" fontFamily={HAND}>
              filled = sourced · hollow/dashed = approximate
            </text>
          </svg>
        </Panel>
        <div className="min-w-0 space-y-3">
          <Panel title={h ? h.label : "Hover the chart"}>
            {h ? (
              <div className="space-y-2 text-sm">
                <div className="font-mono text-2xl text-ink">
                  {h.approx ? "≈" : ""}
                  {h.v.toLocaleString("en-US")} <span className="text-sm text-muted">{unit.split(" /")[0]}</span>
                </div>
                {h.note && <div className="text-xs text-muted">{h.note}</div>}
                <div className="text-xs text-faint">source: {h.src}</div>
                {h.approx && <div className="text-xs text-warn">Approximate — not confirmed in a BCB release.</div>}
              </div>
            ) : (
              <p className="text-xs text-muted">Each point shows its source and whether it is approximate.</p>
            )}
          </Panel>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="2025 total" value="79.8 bn" hint="R$ 35.36 tn (BCB)" />
            <Stat label="record day" value="318.1 M" hint="4 Sep 2026 (press)" tone="warn" />
            <Stat label="keys in DICT" value="1.008 bn" hint="30 Sep 2026" />
            <Stat label="users in DICT" value="187 M" hint="168 M people · 18.7 M firms" />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: switch to the monthly view and look at December and the start of each month — records cluster on paydays (the fifth business
        day), Black Friday and the 13th salary. A 318 M-transaction day is ~3,700 settlements per second on average, with peaks far higher;
        each one settled gross in the SPI, except book transfers between customers of the same PSP, which never leave its ledger. Monthly figures are BCB open data, which runs 11–16% below the official yearly totals
        (intra-PSP Pix were mostly missing).
      </p>
    </div>
  );
}
