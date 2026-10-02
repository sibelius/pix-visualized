"use client";

import { useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";

const T0 = -45;
const T1 = 10;
const OLD_DEACT = -1; // auto-deactivated 24 h before notAfter (day 0)
const BC_ANNOUNCE = -27;
const BC_SWITCH = -20;

const W = 720;
const PADL = 130;
const x = (d: number) => Math.round(PADL + ((d - T0) / (T1 - T0)) * (W - PADL - 10));

type Seg = { from: number; to: number; ok: boolean };
function segments(f: (t: number) => boolean): Seg[] {
  const out: Seg[] = [];
  for (let t = T0; t < T1; t += 0.25) {
    const ok = f(t);
    const last = out[out.length - 1];
    if (last && last.ok === ok) last.to = t + 0.25;
    else out.push({ from: t, to: t + 0.25, ok });
  }
  return out;
}

export function Rotation() {
  const [kind, setKind] = useState<"pia" | "pic">("pia");
  const [upload, setUpload] = useState(-21);
  const [delay, setDelay] = useState(7);
  const [sw, setSw] = useState(-10);
  const [bcLoaded, setBcLoaded] = useState(true);
  const [t, setT] = useState(T0);

  const ticker = useTicker(() => setT((v) => (v >= T1 ? T0 : Math.round((v + 0.1) * 10) / 10)), { speed: 1 });

  const newActive = Math.min(upload + delay, T1);
  const usingNew = (d: number) => d >= sw;
  const accepted = (d: number) => (usingNew(d) ? d >= newActive : d < OLD_DEACT);
  const bcOk = (d: number) => d < BC_SWITCH || bcLoaded;
  const mine = segments(accepted);
  const bc = segments(bcOk);
  const outageDays = mine.filter((s) => !s.ok).reduce((a, s) => a + (s.to - s.from), 0);
  const bcOutage = bc.filter((s) => !s.ok).reduce((a, s) => a + (s.to - s.from), 0);

  const nowOk = accepted(t);
  const nowBc = bcOk(t);
  const effect =
    kind === "pia"
      ? "every message you sign is rejected with an admi.002: no payment leaves, no pacs.002 you send is accepted, so incoming Pix to your customers time out too"
      : "the ICOM and DICT refuse your TLS handshake: you can neither send nor receive anything, not even read the admi.002s. To the rest of the Pix you are simply offline";

  const ROWS = [
    { y: 34, label: "old certificate" },
    { y: 70, label: "new certificate" },
    { y: 106, label: "you use" },
    { y: 142, label: kind === "pia" ? "your messages" : "your connection" },
    { y: 188, label: "BC signing cert" },
    { y: 224, label: "you verify BC" },
  ];
  const H = 26;

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "pia", label: "rotating CERTPIA (signature)" },
            { value: "pic", label: "rotating CERTPIC (connection)" },
          ]}
        />
        <Button variant="primary" onClick={ticker.toggle}>
          {ticker.running ? "Pause" : "Play"}
        </Button>
        <Button
          onClick={() => {
            ticker.pause();
            setT(T0);
          }}
        >
          Reset
        </Button>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={bcLoaded} onChange={(e) => setBcLoaded(e.target.checked)} className="accent-orange-400" />
          loaded the BC&apos;s new certificate into my base
        </label>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        <Panel title="Timeline (day 0 = old certificate's notAfter)" bodyClassName="p-2">
          <div className="grid gap-y-2 px-2 pb-2">
            <Slider label="upload to STA" value={upload} min={-40} max={0} onChange={(v) => setUpload(v)} format={(v) => `day ${v}`} />
            <Slider label="BC activates after" value={delay} min={0} max={7} onChange={setDelay} format={(v) => `${v} d`} />
            <Slider label="switch to new on" value={sw} min={-40} max={5} onChange={setSw} format={(v) => `day ${v}`} />
          </div>
          <svg viewBox={`0 0 ${W} 260`} className="w-full" role="img" aria-label="certificate rotation timeline">
            {ROWS.map((r) => (
              <text key={r.label} x={8} y={r.y + 17} fontSize={11} fill="#8a93a8">
                {r.label}
              </text>
            ))}
            {/* old cert */}
            <rect x={x(T0)} y={34} width={x(OLD_DEACT) - x(T0)} height={H} rx={4} fill="#34d399" fillOpacity={0.25} stroke="#34d399" />
            <rect x={x(OLD_DEACT)} y={34} width={x(0) - x(OLD_DEACT)} height={H} rx={2} fill="#f87171" fillOpacity={0.25} stroke="#f87171" />
            <text x={x(0) + 4} y={51} fontSize={9.5} fill="#f87171">
              expired
            </text>
            {/* new cert */}
            {upload > T0 && (
              <>
                <rect x={x(upload)} y={70} width={Math.max(0, x(newActive) - x(upload))} height={H} rx={4} fill="#f5a524" fillOpacity={0.18} stroke="#f5a524" strokeDasharray="4 3" />
                <rect x={x(newActive)} y={70} width={Math.max(0, x(T1) - x(newActive))} height={H} rx={4} fill="#34d399" fillOpacity={0.25} stroke="#34d399" />
                <text x={x(upload) + 4} y={87} fontSize={9.5} fill="#f5a524">
                  {newActive - upload >= 3 ? "STA: pending" : ""}
                </text>
              </>
            )}
            {/* you use */}
            <rect x={x(T0)} y={106} width={Math.max(0, x(Math.min(sw, T1)) - x(T0))} height={H} rx={4} fill="#5a6275" fillOpacity={0.35} />
            <rect x={x(Math.max(sw, T0))} y={106} width={Math.max(0, x(T1) - x(Math.max(sw, T0)))} height={H} rx={4} fill="#38bdf8" fillOpacity={0.35} />
            <text x={x(T0) + 4} y={123} fontSize={9.5} fill="#e7e9f0">
              old
            </text>
            {sw < T1 - 1 && (
              <text x={x(Math.max(sw, T0)) + 4} y={123} fontSize={9.5} fill="#e7e9f0">
                new
              </text>
            )}
            {/* result */}
            {mine.map((s, i) => (
              <rect key={i} x={x(s.from)} y={142} width={x(s.to) - x(s.from)} height={H} fill={s.ok ? "#34d399" : "#f87171"} fillOpacity={s.ok ? 0.3 : 0.6} />
            ))}
            {/* BC */}
            <rect x={x(T0)} y={188} width={x(BC_SWITCH) - x(T0)} height={H} rx={4} fill="#5a6275" fillOpacity={0.35} />
            <rect x={x(BC_SWITCH)} y={188} width={x(T1) - x(BC_SWITCH)} height={H} rx={4} fill="#a78bfa" fillOpacity={0.35} />
            <line x1={x(BC_ANNOUNCE)} y1={180} x2={x(BC_ANNOUNCE)} y2={218} stroke="#a78bfa" strokeDasharray="2 2" />
            <text x={x(BC_ANNOUNCE) + 3} y={184} fontSize={9} fill="#a78bfa">
              Comunicado Sisbacen (≥ 7 d ahead)
            </text>
            {bc.map((s, i) => (
              <rect key={i} x={x(s.from)} y={224} width={x(s.to) - x(s.from)} height={H} fill={s.ok ? "#34d399" : "#f87171"} fillOpacity={s.ok ? 0.3 : 0.6} />
            ))}
            {/* axis */}
            {[-40, -30, -20, -10, -1, 0, 10].map((d) => (
              <g key={d}>
                <line x1={x(d)} y1={28} x2={x(d)} y2={252} stroke="#242a38" strokeDasharray={d === 0 || d === -1 ? undefined : "2 4"} />
                {d !== -1 && (
                  <text x={x(d)} y={22} fontSize={9} fill="#5a6275" textAnchor="middle">
                    {d}
                  </text>
                )}
              </g>
            ))}
            {/* playhead */}
            <line x1={x(t)} y1={28} x2={x(t)} y2={256} stroke="#fb923c" strokeWidth={2} />
          </svg>
        </Panel>
        <div className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          <Stat label={`day ${t.toFixed(1)}`} value={nowOk ? (kind === "pia" ? "accepted" : "connected") : kind === "pia" ? "rejected" : "offline"} tone={nowOk ? "good" : "bad"} hint={usingNew(t) ? "using the new certificate" : "using the old certificate"} />
          <Stat label="your outage" value={outageDays === 0 ? "none" : `${(outageDays * 24).toFixed(0)} h`} tone={outageDays === 0 ? "good" : "bad"} hint="in this window" />
          <Stat label="BC messages" value={nowBc ? "verified" : "unverifiable"} tone={nowBc ? "good" : "bad"} hint={bcOutage ? `${(bcOutage * 24).toFixed(0)} h of valid BC messages you would reject` : "base up to date"} />
          <Stat label="overlap" value={`${Math.max(0, OLD_DEACT - newActive).toFixed(0)} d`} hint="both certificates active" tone={OLD_DEACT - newActive >= 7 ? "good" : OLD_DEACT - newActive > 0 ? "warn" : "bad"} />
        </div>
      </div>
      {outageDays > 0 && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-ink/90">
          Outage: {effect}.
        </div>
      )}
      <p className="text-xs text-faint">
        Try: move &quot;switch to new&quot; before the BC has activated the upload (red at the start), then after day −1 (red at the end: the old
        certificate is already deactivated even though it expires a day later). Then upload on day −5 with the full 7-day activation: no
        switch day can save you. Untick the BC checkbox to see the other direction: from the BC&apos;s switch day you would reject its valid
        messages.
      </p>
    </div>
  );
}
