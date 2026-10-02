"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { ACTORS, JOURNEYS, type JourneyKey, type Step } from "./journeyData";

const W = 720;
const LANE = [70, 215, 360, 505, 650];
const ROW = 38;
const TOP = 58;

const KIND_COLOR: Record<Step["kind"], string> = {
  api: "#a3e635",
  iso: "#a78bfa",
  user: "#8a93a8",
  local: "#8a93a8",
  qr: "#2dd4bf",
  pay: "#32bcad",
};
const KIND_LABEL: Record<Step["kind"], string> = {
  api: "API Pix (HTTPS + mTLS)",
  iso: "ISO 20022 via SPI/ICOM",
  user: "app / user interaction",
  local: "internal",
  qr: "QR Code",
  pay: "Pix settlement",
};

export function Journeys() {
  const [j, setJ] = useState<JourneyKey>("J1");
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const J = JOURNEYS[j];
  const n = J.steps.length;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setI((x) => {
        if (x >= n - 1) {
          setPlaying(false);
          return x;
        }
        return x + 1;
      });
    }, 1400);
    return () => clearInterval(t);
  }, [playing, n]);

  const pick = (k: JourneyKey) => {
    setJ(k);
    setI(0);
    setPlaying(false);
  };

  // accumulated status up to step i
  let rec = "—";
  let solic = j === "J1" ? "—" : "n/a";
  let payer = "—";
  let timer: string | undefined;
  J.steps.slice(0, i + 1).forEach((s) => {
    if (s.status?.rec) rec = s.status.rec;
    if (s.status?.solic) solic = s.status.solic;
    if (s.status?.payerSide) payer = s.status.payerSide;
    if (s.timer) timer = s.timer;
  });
  const step = J.steps[i];
  const H = TOP + n * ROW + 16;

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={j}
          onChange={pick}
          options={(Object.keys(JOURNEYS) as JourneyKey[]).map((k) => ({ value: k, label: `Jornada ${k.slice(1)}` }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
            ← Prev
          </Button>
          <Button variant="primary" onClick={() => setI((x) => Math.min(n - 1, x + 1))} disabled={i === n - 1}>
            Next →
          </Button>
          <Button
            onClick={() => {
              if (i >= n - 1) setI(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <Button variant="ghost" onClick={() => setI(0)}>
            Reset
          </Button>
        </div>
        <span className="font-mono text-xs text-faint">
          step {i + 1}/{n}
        </span>
      </Controls>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title={J.title}>
          <p className="mb-3 text-sm text-muted">{J.blurb}</p>
          <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px] select-none">
            {LANE.map((x, a) => (
              <g key={a}>
                <rect x={x - 66} y={6} width={132} height={30} rx={7} fill="#171b24" stroke={a === 2 ? "#a78bfa" : "#242a38"} />
                <text x={x} y={25} fontSize={11.5} textAnchor="middle" fill="#e7e9f0">
                  {ACTORS[a]}
                </text>
                <line x1={x} y1={36} x2={x} y2={H - 6} stroke="#242a38" strokeDasharray={a === 2 ? "2 3" : "4 4"} />
              </g>
            ))}
            {J.steps.map((s, k) => {
              const y = TOP + k * ROW + 14;
              const x1 = LANE[s.from];
              const x2 = LANE[s.to];
              const active = k === i;
              const done = k <= i;
              const col = done ? KIND_COLOR[s.kind] : "#242a38";
              const dir = x2 > x1 ? 1 : -1;
              const self = x1 === x2;
              const via = (s.kind === "iso" || s.kind === "pay") && Math.min(x1, x2) < LANE[2] && Math.max(x1, x2) > LANE[2];
              return (
                <g key={k} onClick={() => setI(k)} style={{ cursor: "pointer" }} opacity={done ? 1 : 0.55}>
                  {active && <rect x={4} y={y - 17} width={W - 8} height={ROW - 4} rx={6} fill="#32bcad" opacity={0.07} />}
                  {self ? (
                    <path d={`M${x1} ${y - 6} h18 v12 h-16`} fill="none" stroke={col} strokeWidth={1.5} />
                  ) : (
                    <>
                      <line x1={x1} y1={y} x2={x2 - dir * 6} y2={y} stroke={col} strokeWidth={active ? 2.4 : 1.5} strokeDasharray={s.kind === "user" ? "5 4" : undefined} />
                      <path d={`M${x2} ${y} l${-dir * 8} -4.5 v9 z`} fill={col} />
                      {via && <circle cx={LANE[2]} cy={y} r={4} fill={done ? "#a78bfa" : "#242a38"} stroke="#0a0c11" />}
                    </>
                  )}
                  <text
                    x={self ? x1 + 24 : (x1 + x2) / 2 + (via ? (dir > 0 ? 36 : -36) : 0)}
                    y={y - 6}
                    fontSize={10.5}
                    textAnchor={self ? "start" : "middle"}
                    fill={done ? "#e7e9f0" : "#5a6275"}
                    fontFamily="ui-monospace, monospace"
                  >
                    {s.msg}
                  </text>
                  <text x={10} y={y + 4} fontSize={9.5} fill={active ? "#32bcad" : "#5a6275"} fontFamily="ui-monospace, monospace">
                    {k + 1}
                  </text>
                </g>
              );
            })}
          </svg></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
            {(["api", "iso", "pay", "qr", "user"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ background: KIND_COLOR[k] }} /> {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        </Panel>

        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="rec (API Pix)" value={rec} tone={rec === "APROVADA" ? "good" : rec === "CRIADA" ? "warn" : "neutral"} />
            <Stat label="solicrec" value={solic} tone={solic === "ACEITA" ? "good" : "neutral"} />
            <Stat label="payer PSP" value={<span className="text-sm">{payer}</span>} tone={payer !== "—" ? "good" : "neutral"} />
            <Stat label="journey code" value={J.mndt} hint="pain.012 MndtPrcgTp" />
          </div>
          <Panel title={`Step ${i + 1}: ${step.msg}`}>
            <div className="mb-2 inline-flex items-center gap-2 rounded border border-line bg-panel-2 px-2 py-0.5 font-mono text-[11px]" style={{ color: KIND_COLOR[step.kind] }}>
              {ACTORS[step.from]} → {ACTORS[step.to]}
            </div>
            <p className="text-sm leading-relaxed text-muted">{step.detail}</p>
            {timer && (
              <p className={clsx("mt-2 font-mono text-xs", "text-warn")}>
                timer: {timer}
              </p>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: step through Jornada 1, then Jornada 3 — notice that in Jornada 3 a full pacs.008/pacs.002 settlement sits between the
        payer&apos;s single tap and the first pain.012, and that in the QR journeys nothing reaches the receiver if the payer walks away.
      </p>
    </div>
  );
}
