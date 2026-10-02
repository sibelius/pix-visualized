"use client";

import { useRef, useState } from "react";
import { LineChart } from "@/components/viz/Chart";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { fmt } from "@/lib/random";
import { init, PARTICIPANT_POLICY, step, USER_POLICY, type Category, type Owner, type Params, type Sim } from "./bucket";

type Preset = "honest" | "batch" | "attacker";

const PRESETS: Record<Preset, Partial<Params> & { owner: Owner }> = {
  honest: { owner: "PF", rate: 1, found: 0.97, paid: 0.9, phoneShare: 0.6 },
  batch: { owner: "PJ", rate: 30, found: 0.99, paid: 0.97, phoneShare: 0.2 },
  attacker: { owner: "PF", rate: 40, found: 0.3, paid: 0, phoneShare: 0.9 },
};

const CATS = Object.keys(PARTICIPANT_POLICY) as Category[];

export function RateLimitSim() {
  const [preset, setPreset] = useState<Preset>("honest");
  const [P, setP] = useState<Params>({
    owner: "PF",
    category: "F",
    rate: 1,
    found: 0.97,
    paid: 0.9,
    phoneShare: 0.6,
    background: 120,
    precheck: false,
  });
  const [speed, setSpeed] = useState(10);
  const sim = useRef<Sim | null>(null);
  if (!sim.current) sim.current = init(P.owner, P.category);
  const pref = useRef(P);
  pref.current = P;

  const tk = useTicker(
    () => {
      if (sim.current!.t < 6 * 3600) step(sim.current!, pref.current);
    },
    { speed },
  );
  const s = sim.current;

  const reset = (next: Params) => {
    sim.current = init(next.owner, next.category);
    tk.refresh();
  };
  const set = (patch: Partial<Params>, hard = false) => {
    const next = { ...P, ...patch };
    setP(next);
    if (hard) reset(next);
  };
  const applyPreset = (p: Preset) => {
    setPreset(p);
    const next = { ...P, ...PRESETS[p] };
    setP(next);
    reset(next);
  };

  const U = USER_POLICY[s.owner];
  const C = PARTICIPANT_POLICY[s.category];
  const tmin = s.t / 60;
  const xMax = Math.max(20, Math.ceil(tmin / 10) * 10);
  const lo = Math.min(-25, ...s.samples.map((x) => Math.min(x.a, x.b)));
  const answered = s.ok + s.miss;
  const nfRatio = answered ? s.miss / answered : 0;
  const vcdEos = s.payments ? s.sent / s.payments : s.sent ? Infinity : 0;

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={tk.toggle}>
          {tk.running ? "Pause" : "Run"}
        </Button>
        <Button onClick={() => reset(P)}>Reset</Button>
        <Segmented
          value={preset}
          onChange={applyPreset}
          options={[
            { value: "honest", label: "honest person" },
            { value: "batch", label: "company paying suppliers" },
            { value: "attacker", label: "enumeration attacker" },
          ]}
        />
        <Segmented
          value={P.owner}
          onChange={(v) => set({ owner: v }, true)}
          options={[
            { value: "PF", label: "payer PF" },
            { value: "PJ", label: "payer PJ" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          PSP category
          <select
            value={P.category}
            onChange={(e) => set({ category: e.target.value as Category }, true)}
            className="rounded-lg border border-line bg-bg px-2 py-1 font-mono text-xs text-ink"
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c} · {fmt(PARTICIPANT_POLICY[c].cap)} / +{fmt(PARTICIPANT_POLICY[c].perMin)}/min
              </option>
            ))}
          </select>
        </label>
        <Slider label="lookups / min" value={P.rate} min={0.2} max={120} step={0.2} onChange={(v) => set({ rate: v })} format={(v) => fmt(v, 1)} className="min-w-56 flex-1" />
        <Slider label="keys found" value={P.found} min={0} max={1} step={0.01} onChange={(v) => set({ found: v })} format={(v) => `${Math.round(v * 100)}%`} className="min-w-52 flex-1" />
        <Slider label="found → paid" value={P.paid} min={0} max={1} step={0.01} onChange={(v) => set({ paid: v })} format={(v) => `${Math.round(v * 100)}%`} className="min-w-52 flex-1" />
        <Slider label="phone/e-mail share" value={P.phoneShare} min={0} max={1} step={0.05} onChange={(v) => set({ phoneShare: v })} format={(v) => `${Math.round(v * 100)}%`} className="min-w-52 flex-1" />
        <Slider label="other users at PSP" value={P.background} min={0} max={Math.round(C.perMin * 1.6)} step={Math.max(1, Math.round(C.perMin / 100))} onChange={(v) => set({ background: v })} format={(v) => `${fmt(v)}/min`} className="min-w-56 flex-1" />
        <Segmented
          value={P.precheck ? "on" : "off"}
          onChange={(v) => set({ precheck: v === "on" })}
          options={[
            { value: "off", label: "PSP forwards everything" },
            { value: "on", label: "PSP mirrors buckets (§13.2.2)" },
          ]}
        />
        <Slider label="speed" value={speed} min={1} max={120} onChange={setSpeed} format={(v) => `${v} s/frame`} className="min-w-44" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel title="Payer buckets (scope USER, keyed by PI-PayerId)" right={<span className="font-mono text-xs text-muted">t = {fmt(tmin, 1)} min</span>}>
          <LineChart
            height={230}
            xDomain={[0, xMax]}
            yDomain={[lo, U.cap * 1.05]}
            xLabel="minutes"
            yLabel="tokens"
            xFormat={(v) => String(v)}
            series={[
              { id: "a", label: "ANTISCAN (phone/e-mail)", color: "#22d3ee", points: s.samples.map((x) => [x.t / 60, x.a]) },
              { id: "b", label: "ANTISCAN_V2 (CPF/CNPJ/EVP)", color: "#a78bfa", points: s.samples.map((x) => [x.t / 60, x.b]) },
            ]}
            hMarkers={[
              { y: 0, label: "empty → 429", color: "#f87171" },
              { y: U.cap, label: `capacity ${U.cap}`, color: "#5a6275" },
            ]}
            dots={s.hits429.filter((h) => h.which !== "p").slice(-30).map((h) => ({ x: h.t, y: h.y, color: "#f87171", r: 2.5 }))}
          />
          <div className="mt-3">
            <LineChart
              height={150}
              xDomain={[0, xMax]}
              yDomain={[Math.min(0, ...s.samples.map((x) => x.p)), C.cap * 1.05]}
              xLabel="minutes"
              yLabel="tokens"
              xFormat={(v) => String(v)}
              series={[{ id: "p", label: "PARTICIPANT_ANTISCAN", color: "#fbbf24", points: s.samples.map((x) => [x.t / 60, x.p]), area: true }]}
              hMarkers={[{ y: C.cap, label: `category ${s.category}: ${fmt(C.cap)}, +${fmt(C.perMin)}/min`, color: "#5a6275" }]}
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            Try: run the honest person: one lookup a minute, almost all paid, the buckets never move. Switch to the enumeration attacker: 70% of
            guesses miss and each miss costs 20 tokens, so the bucket is drained in seconds and then sits below zero, paying back at 2 tokens a
            minute. Then raise &quot;other users&quot; on a category F PSP: a single scanning customer can take the whole institution&apos;s bucket down.
          </p>
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3">
          <Stat label="lookups sent" value={fmt(s.sent)} />
          <Stat label="payments" value={fmt(s.payments)} hint={`+${U.credit} user / +1 PSP each`} />
          <Stat label="200 found" value={fmt(s.ok)} hint="−1 user, −1 PSP" />
          <Stat label="404 miss" value={fmt(s.miss)} tone={s.miss ? "warn" : "neutral"} hint="−20 user, −3 PSP" />
          <Stat label="429 from DICT" value={fmt(s.limited)} tone={s.limited ? "bad" : "good"} />
          <Stat label="refused by PSP" value={fmt(s.local)} hint={P.precheck ? "mirror says empty" : "mirror off"} />
          <Stat
            label="VCD / EOS"
            value={Number.isFinite(vcdEos) ? fmt(vcdEos, 2) : "∞"}
            tone={vcdEos >= 2 ? "bad" : vcdEos > 1.3 ? "warn" : "good"}
            hint="lookups ÷ payment orders; ≈2+ is anomalous"
          />
          <Stat
            label="404 / (200+404)"
            value={`${fmt(nfRatio * 100, 1)}%`}
            tone={nfRatio > 0.2 ? "bad" : nfRatio > 0.07 ? "warn" : "good"}
            hint="> 20% per user is a scan signal"
          />
        </div>
      </div>
    </div>
  );
}
