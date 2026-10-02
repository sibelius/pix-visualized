"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Hint, brl } from "./shared";
import { changeTimeline, decide, isNight, type Product } from "./limitsModel";

export function LimitsExplorer() {
  const [hour, setHour] = useState(21);
  const [nightStart, setNS] = useState<"20" | "22">("20");
  const [receiver, setReceiver] = useState<"PF" | "PJ">("PF");
  const [product, setProduct] = useState<Product>("pix");
  const [device, setDevice] = useState<"registered" | "new">("registered");
  const [newUsed, setNewUsed] = useState(0);
  const [dayLimitPF, setDay] = useState(5000);
  const [nightLimitPF, setNight] = useState(1000);
  const [used, setUsed] = useState(300);
  const [amount, setAmount] = useState(800);
  const [psti, setPsti] = useState<"no" | "yes">("no");
  const [pspHours, setPspHours] = useState(30);
  const [autoHours, setAutoHours] = useState(6);

  const r = decide({
    hour,
    nightStart: nightStart === "20" ? 20 : 22,
    receiver,
    product,
    device,
    newDeviceUsedToday: newUsed,
    dayLimitPF,
    nightLimitPF,
    dailyLimitPJ: 8000,
    saqueDay: 1500,
    agendadoDaily: 4000,
    automaticoDaily: 3000,
    usedInBucket: used,
    amount,
    psti: psti === "yes",
  });
  const night = isNight(hour, nightStart === "20" ? 20 : 22);
  const tl = changeTimeline(pspHours, autoHours);
  const X = (h: number) => Math.round(150 + (h / 72) * 480);

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={product}
          onChange={setProduct}
          options={[
            { value: "pix", label: "Pix" },
            { value: "saque", label: "Saque/Troco" },
            { value: "agendado", label: "Agendado" },
            { value: "automatico", label: "Automático" },
          ]}
        />
        <Segmented
          value={receiver}
          onChange={setReceiver}
          options={[
            { value: "PF", label: "to PF" },
            { value: "PJ", label: "to PJ" },
          ]}
        />
        <Segmented
          value={device}
          onChange={setDevice}
          options={[
            { value: "registered", label: "registered device" },
            { value: "new", label: "new device" },
          ]}
        />
        <span className="inline-flex items-center gap-2 text-muted">
          night starts
          <Segmented
            value={nightStart}
            onChange={setNS}
            options={[
              { value: "20", label: "20h" },
              { value: "22", label: "22h" },
            ]}
          />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          PSP via PSTI / non-authorized
          <Segmented
            value={psti}
            onChange={setPsti}
            options={[
              { value: "no", label: "no" },
              { value: "yes", label: "yes" },
            ]}
          />
        </span>
      </Controls>
      <Controls>
        <Slider label="time" value={hour} min={0} max={23} onChange={setHour} format={(v) => `${v}h ${isNight(v, nightStart === "20" ? 20 : 22) ? "night" : "day"}`} className="min-w-52 flex-1" />
        <Slider label="amount" value={amount} min={0} max={20000} step={50} onChange={setAmount} format={brl} className="min-w-56 flex-1" />
        <Slider label="already used in bucket" value={used} min={0} max={10000} step={50} onChange={setUsed} format={brl} className="min-w-56 flex-1" />
        {device === "new" && <Slider label="sent from this device today" value={newUsed} min={0} max={1000} step={50} onChange={setNewUsed} format={brl} className="min-w-56 flex-1" />}
        <Slider label="user day limit (PF rcv)" value={dayLimitPF} min={0} max={20000} step={500} onChange={setDay} format={brl} className="min-w-56 flex-1" />
        <Slider label="user night limit (PF rcv)" value={nightLimitPF} min={0} max={5000} step={100} onChange={setNight} format={brl} className="min-w-56 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="Payer PSP decision chain">
          <ol className="space-y-1.5">
            {r.steps.map((s, i) => (
              <li key={i} className={clsx("rounded-md border p-2 text-[13px]", s.ok ? "border-line bg-panel-2/40" : "border-bad/60 bg-bad/10")}>
                <div className="flex justify-between gap-2">
                  <span className={s.ok ? "text-ink" : "text-bad"}>{s.rule}</span>
                  <span className={clsx("font-mono text-xs", s.ok ? "text-ok" : "text-bad")}>{s.ok ? "pass" : "deny"}</span>
                </div>
                {s.detail && <div className="mt-0.5 text-xs text-muted">{s.detail}</div>}
              </li>
            ))}
          </ol>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="result" value={r.allowed ? "allow" : "deny"} tone={r.allowed ? "good" : "bad"} />
            <Stat label="period" value={night ? "night" : "day"} tone={night ? "warn" : "neutral"} hint={`night = ${nightStart}h–6h`} />
            <Stat label="bucket limit" value={brl(r.bucketLimit)} hint={r.bucket} />
            <Stat label="headroom" value={brl(Math.max(0, r.bucketLimit - used))} />
          </div>
          <p className="text-xs leading-relaxed text-faint">
            Fixed for this demo: PJ-receiver daily R$8,000, Saque day R$1,500, Agendado R$4,000, Automático R$3,000. Hours use either the payer&apos;s registered
            home time zone or Brasília time; each PSP picks one.
          </p>
        </div>
      </div>
      <Panel title="Asking to change a limit: when does it take effect?" right={<span className="text-[11px] text-faint">IN 512 arts. 11–14</span>}>
        <Controls className="mb-3 border-0 bg-transparent px-0 py-0">
          <Slider label="PSP applies increases after" value={pspHours} min={0} max={72} onChange={setPspHours} format={(v) => `${v}h`} className="min-w-56 flex-1" />
          <Slider label="Automático increase after" value={autoHours} min={0} max={24} onChange={setAutoHours} format={(v) => `${v}h`} className="min-w-56 flex-1" />
        </Controls>
        <svg viewBox="0 0 650 175" className="w-full">
          {[0, 8, 24, 48, 72].map((h) => (
            <g key={h}>
              <line x1={X(h)} y1={8} x2={X(h)} y2={160} stroke="#242a38" />
              <text x={X(h)} y={172} fontSize={9.5} textAnchor="middle" fill="#5a6275">
                {h === 0 ? "request" : `+${h}h`}
              </text>
            </g>
          ))}
          {tl.map((c, i) => {
            const y = 16 + i * 29;
            const window = c.from === 24;
            const isAuto = c.label.includes("Automático");
            const clamped = (window && (pspHours < 24 || pspHours > 48)) || (isAuto && autoHours > 8);
            return (
              <g key={c.label}>
                <text x={4} y={y + 11} fontSize={10.5} fill="#8a93a8">
                  {c.label}
                </text>
                {window && <rect x={X(24)} y={y + 2} width={X(48) - X(24)} height={12} rx={3} fill={c.color} opacity={0.15} />}
                {isAuto && <rect x={X(0)} y={y + 2} width={X(8) - X(0)} height={12} rx={3} fill={c.color} opacity={0.15} />}
                <circle cx={X(c.to)} cy={y + 8} r={5} fill={c.color} />
                {clamped && (
                  <text x={X(c.to) + 9} y={y + 11} fontSize={9.5} fill="#f87171">
                    clamped: rule window
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-faint">
          Shaded band = the window the rule allows. A decrease is applied at once; an accepted increase must take effect no sooner than 24h and no later than 48h, so a
          fraudster holding the phone cannot raise the limit and drain the account in one sitting.
        </p>
      </Panel>
      <Hint>at 21h, R$800 to a PF is denied because R$300 + R$800 exceeds the R$1,000 night bucket; drop it to R$700. Switch the night start to 22h, then try the new-device toggle with R$250.</Hint>
    </div>
  );
}
