"use client";

import { useRef, useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { fmt } from "@/lib/random";
import { MAX_STREAMS, newStreamSim, pct, stepStreams, type Phase, type StreamParams } from "./model";

const W = 520;
const LANE = 34;
const r1 = (v: number) => Math.round(v * 10) / 10;
const PHASE_COLOR: Record<Phase, string> = {
  req: "#38bdf8",
  held: "#8a93a8",
  resp: "#34d399",
  proc: "#fbbf24",
  backoff: "#f87171",
  stopped: "#5a6275",
};

export function PullStreams() {
  const [n, setN] = useState(2);
  const [rate, setRate] = useState(50);
  const [rttMs, setRtt] = useState(20);
  const [holdS, setHold] = useState(5);
  const [procMs, setProc] = useState(8);
  const [mode, setMode] = useState<"sync" | "async">("sync");
  const [multipart, setMultipart] = useState<"off" | "on">("off");
  const [deadlineS, setDeadline] = useState(30);
  const [polling, setPolling] = useState(true);
  const [speed, setSpeed] = useState(1);
  const sim = useRef(newStreamSim(3));
  const p: StreamParams = { n, rate, rttMs, holdS, procMs, async: mode === "async", multipart: multipart === "on", deadlineS, polling };
  const pRef = useRef(p);
  pRef.current = p;
  const tk = useTicker(() => stepStreams(sim.current, pRef.current, 16 * speed), { autoplay: false });
  const s = sim.current;
  if (s.streams.length !== n) stepStreams(s, p, 0); // sync the thread count (no time passes)

  const reset = () => {
    sim.current = newStreamSim(3);
    tk.refresh();
  };
  const effective = Math.min(n, MAX_STREAMS);
  const batch = multipart === "on" ? 10 : 1;
  const cycle = rttMs + (mode === "async" ? Math.max(1, procMs * 0.1) : procMs * batch);
  const ceiling = (effective * batch * 1000) / cycle;
  const recent = s.lat.slice(-1500);
  const p50 = pct(recent, 0.5);
  const p99 = pct(recent, 0.99);
  const w200 = recent.length ? recent.filter((x) => x <= 200).length / recent.length : 1;
  const thr = s.hist.length ? s.hist[s.hist.length - 1].thr : 0;

  const H = Math.max(n, 1) * LANE + 44;
  const qMax = Math.max(50, ...s.hist.map((h) => h.q));
  const xPSP = 80;
  const xICOM = 360;
  const pos = (ph: Phase, frac: number) => {
    if (ph === "req") return xPSP + (xICOM - xPSP) * frac;
    if (ph === "resp") return xICOM - (xICOM - xPSP) * frac;
    if (ph === "held") return xICOM;
    return xPSP;
  };

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={tk.toggle}>
          {tk.running ? "Pause" : "Play"}
        </Button>
        <Button onClick={reset}>Reset</Button>
        <Button onClick={() => setPolling((x) => !x)} variant={polling ? "default" : "primary"}>
          {polling ? "Stop polling" : "Resume polling"}
        </Button>
        <span className="inline-flex items-center gap-2 text-muted">
          after reading
          <Segmented value={mode} onChange={setMode} options={[{ value: "sync", label: "process inline" }, { value: "async", label: "store, process async" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          Accept: multipart/mixed
          <Segmented value={multipart} onChange={setMultipart} options={[{ value: "off", label: "off" }, { value: "on", label: "on (≤10)" }]} />
        </span>
        <Slider label="speed" value={speed} min={0.25} max={4} step={0.25} onChange={setSpeed} format={(v) => `×${v}`} className="min-w-44" />
      </Controls>
      <Controls>
        <Slider label="streams (threads)" value={n} min={1} max={8} step={1} onChange={setN} format={(v) => `${v}${v > MAX_STREAMS ? " (>6!)" : ""}`} className="min-w-52 flex-1" />
        <Slider label="incoming msgs/s" value={rate} min={0} max={3000} step={10} onChange={setRate} className="min-w-52 flex-1" />
        <Slider label="RTT" value={rttMs} min={2} max={150} step={1} onChange={setRtt} format={(v) => `${v} ms`} className="min-w-44 flex-1" />
        <Slider label="work per msg" value={procMs} min={0} max={60} step={1} onChange={setProc} format={(v) => `${v} ms`} className="min-w-48 flex-1" />
        <Slider label="long-poll hold" value={holdS} min={1} max={30} step={1} onChange={setHold} format={(v) => `${v} s`} className="min-w-48 flex-1" />
        <Slider label="AB03 deadline" value={deadlineS} min={2} max={40} step={1} onChange={setDeadline} format={(v) => `${v} s`} className="min-w-48 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
        <Panel title="Your reader threads ⇄ ICOM out-stream" right={<span className="font-mono text-xs text-muted">t = {fmt(s.t / 1000, 1)} s</span>}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
            <text x={xPSP} y={14} fontSize={11} textAnchor="middle" fill="#8a93a8">
              PSP reader
            </text>
            <text x={xICOM} y={14} fontSize={11} textAnchor="middle" fill="#8a93a8">
              ICOM
            </text>
            <line x1={xPSP} x2={xPSP} y1={20} y2={H - 14} stroke="#242a38" strokeWidth={2} />
            <line x1={xICOM} x2={xICOM} y1={20} y2={H - 14} stroke="#242a38" strokeWidth={2} />
            {s.streams.map((st, i) => {
              const y = 36 + i * LANE;
              const span = st.phase === "req" || st.phase === "resp" ? rttMs / 2 : 1;
              const frac = Math.min(1, Math.max(0, 1 - (st.until - s.t) / span));
              const x = r1(pos(st.phase, frac));
              const c = i >= MAX_STREAMS ? "#f87171" : PHASE_COLOR[st.phase];
              return (
                <g key={i}>
                  <line x1={xPSP} x2={xICOM} y1={y} y2={y} stroke="#171b24" strokeWidth={8} />
                  <text x={xPSP - 10} y={y + 4} fontSize={10} textAnchor="end" fill={i >= MAX_STREAMS ? "#f87171" : "#5a6275"}>
                    stream {i + 1}
                  </text>
                  <circle cx={x} cy={y} r={st.phase === "held" ? 6 : 5} fill={c} />
                  {st.batch.length > 0 && (
                    <text x={x} y={y - 8} fontSize={9} textAnchor="middle" fill="#34d399">
                      {st.batch.length}
                    </text>
                  )}
                  <text x={xICOM + 12} y={y + 4} fontSize={10} fill={c}>
                    {st.phase === "held" ? `holding ${fmt((s.t - st.since) / 1000, 1)}s` : st.phase === "backoff" ? "429, backing off" : st.phase === "proc" ? "processing" : st.phase === "stopped" ? "stopped" : st.last}
                  </text>
                </g>
              );
            })}
            {/* SPI queue */}
            <rect x={W - 40} y={20} width={24} height={H - 34} fill="#11141b" stroke="#242a38" />
            <rect x={W - 40} y={r1(H - 14 - Math.min(1, s.queue.length / qMax) * (H - 34))} width={24} height={r1(Math.min(1, s.queue.length / qMax) * (H - 34))} fill={s.queue.length > rate * 2 ? "#f87171" : "#f472b6"} />
            <text x={W - 28} y={H - 2} fontSize={9.5} textAnchor="middle" fill="#8a93a8">
              queue {fmt(s.queue.length)}
            </text>
          </svg>
          {/* history */}
          <svg viewBox={`0 0 ${W} 80`} className="mt-2 w-full">
            <text x={4} y={10} fontSize={9.5} fill="#5a6275">
              last 60 s · pink: queued at SPI · green: consumed/s
            </text>
            {(() => {
              const tMax = Math.max(1, ...s.hist.map((h) => h.thr), rate);
              const pts = s.hist;
              const X = (i: number) => r1(4 + (i / 120) * (W - 8));
              return (
                <>
                  <path d={pts.map((h, i) => `${i ? "L" : "M"}${X(i)},${r1(76 - (h.q / qMax) * 58)}`).join("")} fill="none" stroke="#f472b6" strokeWidth={1.5} />
                  <path d={pts.map((h, i) => `${i ? "L" : "M"}${X(i)},${r1(76 - (h.thr / tMax) * 58)}`).join("")} fill="none" stroke="#34d399" strokeWidth={1.5} />
                </>
              );
            })()}
          </svg>
        </Panel>
        <div className="grid content-start gap-2">
          <Stat label="consumed / s" value={fmt(thr)} hint={`ceiling ≈ ${fmt(ceiling)} = ${effective} × ${batch} / ${fmt(cycle, 1)} ms`} tone={thr + 1 < rate * 0.95 && s.t > 3000 ? "bad" : "good"} />
          <Stat label="queued at SPI" value={fmt(s.queue.length)} tone={s.queue.length > rate ? "bad" : "neutral"} />
          <Stat label="wait p50 / p99" value={`${fmt(p50)} / ${fmt(p99)} ms`} tone={p99 > 200 ? "warn" : "good"} />
          <Stat label="consumed ≤ 200 ms" value={`${fmt(w200 * 100, 1)}%`} tone={w200 >= 0.99 ? "good" : "bad"} hint="homologation: ≥ 99% within 200 ms" />
          <Stat label="AB03 (expired)" value={fmt(s.ab03 + s.late)} tone={s.ab03 + s.late ? "bad" : "good"} hint="not read, or answered too late" />
          <Stat label="200 / 204 / 429" value={`${fmt(s.c200)} / ${fmt(s.c204)} / ${fmt(s.c429)}`} />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: press Play, then raise incoming traffic to 600/s. Two inline-processing threads cannot keep up, so the queue grows and wait times blow past 200 ms. Fix
        it in three ways: store and process async, turn on multipart, add threads (up to 6; the 7th only collects 429s). Finally, press Stop polling and watch messages
        expire as AB03.
      </p>
    </div>
  );
}
