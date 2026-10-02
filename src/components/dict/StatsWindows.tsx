"use client";

import { useMemo, useState } from "react";
import { Button, Controls, Panel, Slider, Stat } from "@/components/ui";
import { rng } from "@/lib/random";
import { XmlView, DICT_DOCS } from "./XmlView";

type MarkerType = "ApplicationFrauds" | "MuleAccounts" | "ScammerAccounts" | "OtherFrauds" | "UnknownFrauds";
type Ev = { t: number; kind: "settle" } | { t: number; kind: "marker"; type: MarkerType; amount: number; cancelled?: boolean };

const DAYMS = 86400e3;
const V2_CUTOFF = Date.UTC(2023, 10, 5, 3); // 05/11/2023 03:00Z: settlement counters start here
const START = Date.UTC(2023, 10, 17); // first selectable query day (the spec's example date)
const END = Date.UTC(2026, 9, 2);
const LAG_H = 6; // watermark lag used in this demo (spec: up to 12 h)

const COLORS: Record<MarkerType, string> = {
  ApplicationFrauds: "#f472b6",
  MuleAccounts: "#f87171",
  ScammerAccounts: "#fb923c",
  OtherFrauds: "#fbbf24",
  UnknownFrauds: "#8a93a8",
};

function seedEvents(): Ev[] {
  const r = rng(42);
  const ev: Ev[] = [];
  for (let t = Date.UTC(2021, 0, 1); t < END; t += DAYMS) {
    // a small merchant: ~0.6 settlements a day, growing over time
    const lam = 0.3 + ((t - Date.UTC(2021, 0, 1)) / (END - Date.UTC(2021, 0, 1))) * 0.9;
    if (r.bernoulli(Math.min(0.95, lam))) ev.push({ t: t + r.int(10, 22) * 3600e3, kind: "settle" });
  }
  const m = (y: number, mo: number, d: number, type: MarkerType, amount: number): Ev => ({ t: Date.UTC(y, mo - 1, d, 15), kind: "marker", type, amount });
  ev.push(m(2021, 9, 14, "ScammerAccounts", 1200), m(2022, 9, 2, "UnknownFrauds", 450), m(2024, 3, 11, "OtherFrauds", 300), m(2025, 8, 21, "MuleAccounts", 2500));
  ev.push(m(2026, 7, 20, "MuleAccounts", 1870), m(2026, 9, 28, "MuleAccounts", 3000));
  return ev.sort((a, b) => a.t - b.t);
}
const EVENTS = seedEvents();

function windows(now: number) {
  const d = new Date(now - 3 * 3600e3); // BRT calendar date
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    d90: [Date.UTC(y, mo, day - 89, 3), now] as const,
    m12: [Date.UTC(y, mo - 12, 1, 3), Date.UTC(y, mo, 1, 3)] as const,
    m60: [Date.UTC(y, mo - 60, 1, 3), Date.UTC(y, mo, 1, 3)] as const,
  };
}

const iso = (t: number) => new Date(t).toISOString().replace(".000", "").replace("Z", "Z");
const dmy = (t: number) => {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:00Z`;
};

export function StatsWindows() {
  const totalDays = Math.round((END - START) / DAYMS);
  const [dayIdx, setDayIdx] = useState(totalDays);
  const [extra, setExtra] = useState<Ev[]>([]);
  const [cancelled, setCancelled] = useState<number[]>([]);
  const now = START + dayIdx * DAYMS + 17 * 3600e3;
  const W = useMemo(() => windows(now), [now]);
  const watermark = now - LAG_H * 3600e3;

  const all = useMemo(() => [...EVENTS, ...extra].sort((a, b) => a.t - b.t), [extra]);

  const count = (pred: (e: Ev) => boolean, w: readonly [number, number], end = watermark) =>
    all.filter((e) => pred(e) && e.t >= w[0] && e.t < Math.min(w[1], end)).length;

  const isMarker = (type: MarkerType) => (e: Ev) => e.kind === "marker" && e.type === type && !cancelled.includes(e.t);
  const isSettle = (e: Ev) => e.kind === "settle" && e.t >= V2_CUTOFF;
  const sumAmt = (w: readonly [number, number]) =>
    all
      .filter((e) => e.kind === "marker" && e.type !== "UnknownFrauds" && !cancelled.includes(e.t) && e.t >= w[0] && e.t < Math.min(w[1], watermark))
      .reduce((a, e) => a + (e.kind === "marker" ? e.amount : 0), 0);

  const triple = (f: (w: readonly [number, number]) => number) => `d90="${f(W.d90)}" m12="${f(W.m12)}" m60="${f(W.m60)}"`;
  const types: MarkerType[] = ["ApplicationFrauds", "MuleAccounts", "ScammerAccounts", "OtherFrauds", "UnknownFrauds"];

  const xml = [
    `<KeyStatistics>`,
    `    <Spi>`,
    `        <Watermark>${iso(watermark)}</Watermark>`,
    `        <Settlements ${triple((w) => count(isSettle, w))}/>`,
    `    </Spi>`,
    `    <FraudMarkers>`,
    `        <Watermark>${iso(watermark)}</Watermark>`,
    ...types.map((t) => `        <${t} ${triple((w) => count(isMarker(t), w))}/>`),
    `        <TotalFraudTransactionAmount ${triple(sumAmt)}/>`,
    `    </FraudMarkers>`,
    `</KeyStatistics>`,
  ].join("\n");

  // timeline geometry: show the m60 window plus the current month
  const t0 = W.m60[0];
  const t1 = now + 5 * DAYMS;
  const L = 16;
  const R = 624;
  const x = (t: number) => Math.round(L + ((t - t0) / (t1 - t0)) * (R - L));
  const settles = all.filter((e) => e.kind === "settle" && e.t >= t0);
  const markers = all.filter((e): e is Extract<Ev, { kind: "marker" }> => e.kind === "marker" && e.t >= t0 - 0);

  const muleD90 = count(isMarker("MuleAccounts"), W.d90);

  return (
    <div className="space-y-4">
      <Controls>
        <Slider
          label="query time"
          value={dayIdx}
          min={0}
          max={totalDays}
          onChange={setDayIdx}
          format={() => new Date(now).toISOString().slice(0, 10)}
          className="min-w-72 flex-1"
        />
        <Button
          onClick={() => setExtra((e) => [...e, { t: now - 2 * 3600e3, kind: "marker", type: "MuleAccounts", amount: 990 }])}
        >
          close a report AGREED (MULE_ACCOUNT) now
        </Button>
        <Button
          onClick={() => {
            const last = [...all].reverse().find((e) => e.kind === "marker" && e.t < now && !cancelled.includes(e.t));
            if (last) setCancelled((c) => [...c, last.t]);
          }}
        >
          cancelFraudMarker (latest)
        </Button>
        <Button variant="ghost" onClick={() => setDayIdx(Math.round((Date.UTC(2023, 10, 17) - START) / DAYMS))}>
          spec example date
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <Panel title="Windows over the event history of one key" right={<span className="font-mono text-xs text-muted">now {dmy(now)}</span>}>
          <svg viewBox="0 0 640 170" className="w-full">
            {[
              { k: "m60", w: W.m60, y: 20, c: "#5a6275", label: "m60: 60 full months, current month excluded" },
              { k: "m12", w: W.m12, y: 44, c: "#a78bfa", label: "m12: 12 full months" },
              { k: "d90", w: W.d90, y: 68, c: "#22d3ee", label: "d90: last 89 days + today" },
            ].map((b) => (
              <g key={b.k}>
                <rect x={x(b.w[0])} y={b.y} width={Math.max(2, x(b.w[1]) - x(b.w[0]))} height={14} rx={3} fill={b.c} opacity={0.25} stroke={b.c} />
                <text
                  x={x(b.w[1]) - x(b.w[0]) < 170 ? x(b.w[0]) - 4 : Math.max(L + 2, x(b.w[0]) + 4)}
                  textAnchor={x(b.w[1]) - x(b.w[0]) < 170 ? "end" : "start"}
                  y={b.y + 11}
                  fontSize={9.5}
                  fill={b.c === "#5a6275" ? "#8a93a8" : b.c}
                >
                  {b.label}
                </text>
              </g>
            ))}
            <rect x={x(watermark)} y={14} width={Math.max(1, x(now) - x(watermark))} height={110} fill="#fbbf24" opacity={0.12} />
            <line x1={x(V2_CUTOFF)} x2={x(V2_CUTOFF)} y1={88} y2={128} stroke="#8a93a8" strokeDasharray="2 3" />
            {x(V2_CUTOFF) > L && (
              <text x={x(V2_CUTOFF) + 3} y={96} fontSize={9} fill="#8a93a8">
                API v2 cutoff
              </text>
            )}
            {settles.map((e, i) => (
              <line key={i} x1={x(e.t)} x2={x(e.t)} y1={110} y2={122} stroke="#34d399" strokeOpacity={e.t >= V2_CUTOFF ? 0.35 : 0.12} />
            ))}
            {markers.map((e, i) => (
              <g key={i}>
                <circle cx={x(e.t)} cy={140} r={5} fill={cancelled.includes(e.t) ? "transparent" : COLORS[e.type]} stroke={COLORS[e.type]} strokeWidth={1.5} />
              </g>
            ))}
            <line x1={x(now)} x2={x(now)} y1={10} y2={150} stroke="#e7e9f0" />
            <text x={L} y={164} fontSize={9.5} fill="#5a6275">
              {new Date(t0).toISOString().slice(0, 7)}
            </text>
            <text x={R} y={164} fontSize={9.5} textAnchor="end" fill="#5a6275">
              now
            </text>
            <text x={L} y={106} fontSize={9.5} fill="#34d399">
              settlements
            </text>
            <text x={L} y={154} fontSize={9.5} fill="#8a93a8">
              fraud markers (hollow = cancelled)
            </text>
          </svg>
          <div className="mt-2 grid gap-1 font-mono text-[11px] text-muted sm:grid-cols-3">
            <div>d90 {dmy(W.d90[0])} → now</div>
            <div>m12 {dmy(W.m12[0])} → {dmy(W.m12[1])}</div>
            <div>m60 {dmy(W.m60[0])} → {dmy(W.m60[1])}</div>
          </div>
          <p className="mt-2 text-xs text-faint">
            Try: the spec example date (17/11/2023 17:00Z) reproduces the boundaries in the API docs: d90 starts 20/08/2023 03:00Z, m12 and m60 end
            at 01/11/2023 03:00Z (midnight in Brasília). Note how events of the current month count in d90 but not in m12/m60, and how events newer
            than the Watermark (yellow band) are not counted yet.
          </p>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="MuleAccounts d90" value={muleD90} tone={muleD90 >= 2 ? "bad" : muleD90 ? "warn" : "good"} />
            <Stat label="Settlements m12" value={count(isSettle, W.m12)} hint="as receiver in the SPI" />
          </div>
          <XmlView xml={xml} docs={DICT_DOCS} maxHeight={300} highlight={["MuleAccounts"]} />
        </div>
      </div>
    </div>
  );
}
