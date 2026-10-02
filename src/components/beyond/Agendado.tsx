"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Hint, brl } from "./shared";
import { DAYS, dayLabel, simulate, weekday, type Freq, type Occ, type Schedule } from "./agendadoModel";

const INITIAL: Schedule[] = [
  { id: 1, label: "Rent → landlord (PF)", amount: 1800, receiverPF: true, freq: "monthly", first: 4, count: 2, createdHour: 10 },
  { id: 2, label: "Allowance → daughter (PF)", amount: 150, receiverPF: true, freq: "weekly", first: 1, count: 8, createdHour: 10 },
  { id: 3, label: "Gym → company (PJ)", amount: 120, receiverPF: false, freq: "monthly", first: 9, count: 2, createdHour: 10 },
];

const COLORS = ["#fbbf24", "#32bcad", "#818cf8", "#f472b6", "#a3e635", "#fb923c"];

export function Agendado() {
  const [schedules, setSchedules] = useState<Schedule[]>(INITIAL);
  const [dailyLimit, setLimit] = useState(2000);
  const [lowerFrom, setLowerFrom] = useState(-1);
  const [brokeDay, setBroke] = useState(-1);
  const [keyGoneFor, setKeyGone] = useState(-1);
  const [freq, setFreq] = useState<Freq>("once");
  const [amount, setAmount] = useState(600);
  const [first, setFirst] = useState(1);
  const [hour, setHour] = useState(21);
  const [pf, setPf] = useState<"pf" | "pj">("pf");
  const [sel, setSel] = useState<number | null>(4);

  const occ = simulate(schedules, { dailyLimit, lowerFrom, loweredTo: 1000, brokeDay, keyGoneFor });
  const byDay = new Map<number, Occ[]>();
  for (const o of occ) byDay.set(o.day, [...(byDay.get(o.day) ?? []), o]);
  const add = () => {
    const id = Math.max(0, ...schedules.map((s) => s.id)) + 1;
    setSchedules([
      ...schedules,
      { id, label: `#${id} ${freq} → ${pf === "pf" ? "PF" : "PJ"}`, amount, receiverPF: pf === "pf", freq, first, count: freq === "weekly" ? 6 : 2, createdHour: hour },
    ]);
  };
  const settled = occ.filter((o) => o.settle?.ok).length;
  const rejectedC = occ.filter((o) => !o.confirm.ok).length;
  const failedS = occ.filter((o) => o.settle && !o.settle.ok).length;
  const sch = (id: number) => schedules.findIndex((s) => s.id === id);

  return (
    <div className="space-y-4">
      <Controls>
        <span className="text-muted">new schedule</span>
        <Segmented
          value={freq}
          onChange={setFreq}
          options={[
            { value: "once", label: "once" },
            { value: "weekly", label: "weekly" },
            { value: "monthly", label: "monthly" },
          ]}
        />
        <Segmented
          value={pf}
          onChange={setPf}
          options={[
            { value: "pf", label: "to a PF" },
            { value: "pj", label: "to a PJ" },
          ]}
        />
        <Slider label="amount" value={amount} min={50} max={3000} step={50} onChange={setAmount} format={brl} className="min-w-52 flex-1" />
        <Slider label="first date" value={first} min={1} max={DAYS - 1} onChange={setFirst} format={dayLabel} className="min-w-52 flex-1" />
        <Slider label="created at (1 Oct)" value={hour} min={0} max={23} onChange={setHour} format={(v) => `${v}h`} className="min-w-52 flex-1" />
        <Button variant="primary" onClick={add}>
          Schedule
        </Button>
        <Button variant="ghost" onClick={() => setSchedules(INITIAL)}>
          Reset
        </Button>
      </Controls>
      <Controls>
        <Slider label="daily Pix Agendado limit" value={dailyLimit} min={500} max={5000} step={100} onChange={setLimit} format={brl} className="min-w-56 flex-1" />
        <Slider
          label="payer lowers limit to R$1,000 from"
          value={lowerFrom}
          min={-1}
          max={DAYS - 1}
          onChange={setLowerFrom}
          format={(v) => (v < 0 ? "never" : dayLabel(v))}
          className="min-w-64 flex-1"
        />
        <Slider label="no balance on" value={brokeDay} min={-1} max={DAYS - 1} onChange={setBroke} format={(v) => (v < 0 ? "never" : dayLabel(v))} className="min-w-56 flex-1" />
        <span className="inline-flex items-center gap-2 text-muted">
          receiver deletes key
          <select
            value={keyGoneFor}
            onChange={(e) => setKeyGone(Number(e.target.value))}
            className="rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-ink"
          >
            <option value={-1}>none</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Eight weeks of scheduled Pix (click a day)">
          <div className="grid grid-cols-7 gap-1 text-[10px]">
            {["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"].map((w) => (
              <div key={w} className="text-center text-faint">
                {w}
              </div>
            ))}
            {Array.from({ length: DAYS }, (_, d) => {
              const os = byDay.get(d) ?? [];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSel(d)}
                  className={clsx(
                    "min-h-12 rounded-md border p-1 text-left transition",
                    sel === d ? "border-accent" : "border-line hover:border-faint",
                    d === 0 ? "bg-panel-2" : "bg-bg",
                  )}
                >
                  <div className="text-faint">{d === 0 ? "today" : dayLabel(d)}</div>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {os.map((o, i) => {
                      const bad = !o.confirm.ok || (o.settle && !o.settle.ok);
                      return (
                        <span
                          key={i}
                          className="inline-block h-2 w-3 rounded-sm"
                          style={{
                            background: bad ? "transparent" : COLORS[sch(o.sid) % COLORS.length],
                            border: `1.5px solid ${bad ? "#f87171" : COLORS[sch(o.sid) % COLORS.length]}`,
                          }}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1.5">
            {sel !== null && (byDay.get(sel) ?? []).length === 0 && <div className="text-xs text-faint">Nothing scheduled for {dayLabel(sel)}.</div>}
            {sel !== null &&
              (byDay.get(sel) ?? []).map((o, i) => {
                const s = schedules[sch(o.sid)];
                return (
                  <div key={i} className="rounded-md border border-line bg-panel-2/50 p-2 text-[12.5px]">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium" style={{ color: COLORS[sch(o.sid) % COLORS.length] }}>
                        {s?.label}
                      </span>
                      <span className="font-mono text-xs">
                        {brl(o.amount)} · {weekday(o.day)} {dayLabel(o.day)}
                      </span>
                    </div>
                    <div className={clsx("mt-1", o.confirm.ok ? "text-muted" : "text-bad")}>confirm (1 Oct): {o.confirm.why}</div>
                    {o.settle && <div className={clsx("mt-0.5", o.settle.ok ? "text-ok" : "text-bad")}>settle: {o.settle.why}</div>}
                  </div>
                );
              })}
          </div>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="occurrences" value={occ.length} />
            <Stat label="settled" value={settled} tone="good" />
            <Stat label="rejected at confirm" value={rejectedC} tone={rejectedC ? "bad" : "neutral"} />
            <Stat label="failed at settle" value={failedS} tone={failedS ? "bad" : "neutral"} />
          </div>
          <div className="rounded-xl border border-line bg-panel p-3 text-[13px] leading-relaxed text-muted">
            The order sits in the payer PSP and does not touch the balance until the date. Then it becomes an ordinary Pix sent on the{" "}
            <em>canal secundário</em> (<span className="font-mono">NORM</span> + <span className="font-mono">PAGAGD</span>). Since Res. BCB 402/425 every PSP serving individuals must offer one-off and recurring schedules.
            A <em>cobrança com vencimento</em> (<a className="text-accent underline-offset-2 hover:underline" href="/api-pix">cobv</a>,{" "}
            <a className="text-accent underline-offset-2 hover:underline" href="/qrcode">QR</a>) that the payer schedules uses this same Pix Agendado limit (IN 512 art. 8).
          </div>
        </div>
      </div>
      <Hint>schedule R$600 &quot;once&quot; to a PF for 2 Oct created at 21h, twice: the second breaks the R$1,000 night cap. Then lower the limit from 5 Oct and watch the rent fail on its settlement date even though it was confirmed.</Hint>
    </div>
  );
}
