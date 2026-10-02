"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { brl, computeCobv, fromDay, toDay, WD, weekday, type CobvParams } from "./cobv";

const DESC = ["none", "1 · fixed value until date", "2 · % until date", "3 · value / calendar day early", "4 · value / business day early", "5 · % / calendar day early", "6 · % / business day early"];
const JUROS = [
  "none",
  "1 · value / calendar day",
  "2 · % per day (calendar)",
  "3 · % per month (calendar, n=30)",
  "4 · % per year (calendar, n=360)",
  "5 · value / business day",
  "6 · % per day (business)",
  "7 · % per month (business, n=21)",
  "8 · % per year (business, n=252)",
];

function Select({ value, options, onChange, label }: { value: number; options: string[]; onChange: (v: number) => void; label: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] tracking-wide text-faint uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-faint"
      >
        {options.map((o, i) => (
          <option key={i} value={i}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] tracking-wide text-faint uppercase">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-line bg-panel-2 focus-within:border-faint">
        <input
          type="number"
          step="0.01"
          min={0}
          value={(value / 100).toFixed(2)}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) * 100)))}
          className="w-full min-w-0 bg-transparent px-2 py-1.5 font-mono text-sm text-ink outline-none"
        />
        <span className="pr-2 text-xs text-faint">{suffix}</span>
      </div>
    </label>
  );
}

export function CobvCalculator() {
  const [p, setP] = useState<CobvParams>({
    original: 125000,
    due: "2026-10-17",
    validade: 30,
    abatMod: 0,
    abatVal: 0,
    descMod: 1,
    descFixed: [
      { date: "2026-10-05", val: 5000 },
      { date: "2026-10-12", val: 2500 },
    ],
    descVal: 1000,
    jurosMod: 3,
    jurosVal: 100,
    multaMod: 2,
    multaVal: 200,
  });
  const [offset, setOffset] = useState(6);
  const [holidayOnDue, setHolidayOnDue] = useState(false);
  const set = <K extends keyof CobvParams>(k: K, v: CobvParams[K]) => setP((s) => ({ ...s, [k]: v }));

  const due = toDay(p.due);
  const holidays = useMemo(() => {
    const h = new Set<number>();
    if (holidayOnDue) {
      // a municipal holiday on the first business day on/after the due date
      let d = due;
      while (weekday(d) === 0 || weekday(d) === 6) d++;
      h.add(d);
    }
    return h;
  }, [holidayOnDue, due]);
  const payDate = fromDay(due + offset);
  const r = computeCobv(p, payDate, holidays);

  const minOff = -20;
  const maxOff = p.validade + 8;
  const series = useMemo(() => {
    const out: { off: number; vf: number; payable: boolean; wk: boolean }[] = [];
    for (let o = minOff; o <= maxOff; o++) {
      const d = due + o;
      const x = computeCobv(p, fromDay(d), holidays);
      out.push({ off: o, vf: x.vf, payable: x.payable, wk: weekday(d) === 0 || weekday(d) === 6 || holidays.has(d) });
    }
    return out;
  }, [p, holidays, due, maxOff, minOff]);

  const W = 640;
  const H = 190;
  const vMin = Math.min(...series.map((s) => s.vf));
  const vMax = Math.max(...series.map((s) => s.vf));
  const sx = (o: number) => Math.round((40 + ((o - minOff) / (maxOff - minOff)) * (W - 56)) * 10) / 10;
  const sy = (v: number) => Math.round((H - 26 - ((v - vMin) / Math.max(1, vMax - vMin)) * (H - 50)) * 10) / 10;
  const bw = (W - 56) / (maxOff - minOff);
  let path = "";
  series.forEach((s, i) => {
    if (!s.payable) return;
    path += `${i === 0 || !series[i - 1].payable ? "M" : "L"}${sx(s.off)} ${sy(s.vf)} `;
  });

  const body: Record<string, unknown> = { original: brl(p.original) };
  if (p.abatMod) body.abatimento = { modalidade: p.abatMod, valorPerc: brl(p.abatVal) };
  if (p.descMod === 1 || p.descMod === 2) body.desconto = { modalidade: p.descMod, descontoDataFixa: p.descFixed.map((d) => ({ data: d.date, valorPerc: brl(d.val) })) };
  else if (p.descMod) body.desconto = { modalidade: p.descMod, valorPerc: brl(p.descVal) };
  if (p.jurosMod) body.juros = { modalidade: p.jurosMod, valorPerc: brl(p.jurosVal) };
  if (p.multaMod) body.multa = { modalidade: p.multaMod, valorPerc: brl(p.multaVal) };
  const served: Record<string, string> = { original: brl(p.original) };
  if (r.va) served.abatimento = brl(r.va);
  if (r.vd) served.desconto = brl(r.vd);
  if (r.vj) served.juros = brl(r.vj);
  if (r.vm) served.multa = brl(r.vm);
  served.final = brl(r.vf);

  const pctOrVal = (mod: number, pctMods: number[]) => (pctMods.includes(mod) ? "%" : "R$");

  return (
    <div className="space-y-4">
      <Controls>
        <Slider
          label="payment date (DPP)"
          value={offset}
          min={minOff}
          max={maxOff}
          onChange={setOffset}
          format={(v) => `${v >= 0 ? "+" : ""}${v}d`}
          className="min-w-64 flex-[2]"
        />
        <span className="font-mono text-xs text-ink">
          {payDate} ({WD[weekday(due + offset)]})
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          municipal holiday on due date (codMun)
          <Segmented value={holidayOnDue ? "yes" : "no"} onChange={(v) => setHolidayOnDue(v === "yes")} options={[{ value: "no", label: "no" }, { value: "yes", label: "yes" }]} />
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel title="PUT /cobv/{txid} — valor & calendario">
          <div className="grid gap-3 sm:grid-cols-2">
            <Num label="valor.original" value={p.original} onChange={(v) => set("original", Math.max(1, v))} suffix="R$" />
            <label className="block min-w-0">
              <span className="text-[11px] tracking-wide text-faint uppercase">calendario.dataDeVencimento</span>
              <input
                type="date"
                value={p.due}
                onChange={(e) => e.target.value && set("due", e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm text-ink outline-none [color-scheme:dark]"
              />
            </label>
            <div className="sm:col-span-2">
              <Slider label="validadeAposVencimento" value={p.validade} min={0} max={60} onChange={(v) => set("validade", v)} format={(v) => `${v} days`} />
            </div>
            <Select label="abatimento.modalidade" value={p.abatMod} options={["none", "1 · fixed value", "2 · percent"]} onChange={(v) => set("abatMod", v as CobvParams["abatMod"])} />
            {p.abatMod ? <Num label="abatimento.valorPerc" value={p.abatVal} onChange={(v) => set("abatVal", v)} suffix={p.abatMod === 2 ? "%" : "R$"} /> : <div />}
            <Select label="desconto.modalidade" value={p.descMod} options={DESC} onChange={(v) => set("descMod", v as CobvParams["descMod"])} />
            {p.descMod >= 3 ? <Num label="desconto.valorPerc" value={p.descVal} onChange={(v) => set("descVal", v)} suffix={p.descMod >= 5 ? "%/day" : "R$/day"} /> : <div />}
            {(p.descMod === 1 || p.descMod === 2) &&
              p.descFixed.map((d, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:col-span-2">
                  <input
                    type="date"
                    value={d.date}
                    onChange={(e) => set("descFixed", p.descFixed.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                    className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink [color-scheme:dark]"
                  />
                  <Num label={`descontoDataFixa[${i}]`} value={d.val} onChange={(v) => set("descFixed", p.descFixed.map((x, j) => (j === i ? { ...x, val: v } : x)))} suffix={p.descMod === 2 ? "%" : "R$"} />
                </div>
              ))}
            <Select label="juros.modalidade" value={p.jurosMod} options={JUROS} onChange={(v) => set("jurosMod", v as CobvParams["jurosMod"])} />
            {p.jurosMod ? <Num label="juros.valorPerc" value={p.jurosVal} onChange={(v) => set("jurosVal", v)} suffix={pctOrVal(p.jurosMod, [2, 3, 4, 6, 7, 8])} /> : <div />}
            <Select label="multa.modalidade" value={p.multaMod} options={["none", "1 · fixed value", "2 · percent"]} onChange={(v) => set("multaMod", v as CobvParams["multaMod"])} />
            {p.multaMod ? <Num label="multa.valorPerc" value={p.multaVal} onChange={(v) => set("multaVal", v)} suffix={p.multaMod === 2 ? "%" : "R$"} /> : <div />}
          </div>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-bg/50 p-2 font-mono text-[10.5px] text-muted">{JSON.stringify({ calendario: { dataDeVencimento: p.due, validadeAposVencimento: p.validade }, valor: body }, null, 2)}</pre>
        </Panel>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Vo" value={brl(p.original)} />
            <Stat label="− Va" value={brl(r.va)} />
            <Stat label="− Vd" value={brl(r.vd)} tone={r.vd ? "good" : "neutral"} />
            <Stat label="+ Vj" value={brl(r.vj)} tone={r.vj ? "warn" : "neutral"} />
            <Stat label="+ Vm" value={brl(r.vm)} tone={r.vm ? "warn" : "neutral"} />
            <Stat label="= Vf" value={r.payable ? brl(r.vf) : "—"} tone={r.payable ? "good" : "bad"} hint={r.payable ? "valor.final" : "not payable"} />
          </div>
          <Panel title="valor.final for every possible payment date">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              {series.map((s) =>
                s.wk ? <rect key={s.off} x={Math.round((sx(s.off) - bw / 2) * 10) / 10} y={10} width={Math.round(bw * 10) / 10} height={H - 36} fill="#171b24" /> : null,
              )}
              {series.map((s) => (!s.payable ? <rect key={`x${s.off}`} x={Math.round((sx(s.off) - bw / 2) * 10) / 10} y={10} width={Math.round(bw * 10) / 10} height={H - 36} fill="#f87171" opacity={0.12} /> : null))}
              <line x1={sx(0)} x2={sx(0)} y1={10} y2={H - 26} stroke="#8a93a8" strokeDasharray="3 3" />
              <text x={sx(0)} y={H - 12} fontSize={9.5} textAnchor="middle" fill="#8a93a8">
                due
              </text>
              <line x1={sx(r.dueAdj - due)} x2={sx(r.dueAdj - due)} y1={10} y2={H - 26} stroke="#fbbf24" strokeDasharray="2 3" opacity={r.dueAdj !== due ? 1 : 0} />
              <line x1={sx(r.lastDay - due)} x2={sx(r.lastDay - due)} y1={10} y2={H - 26} stroke="#f87171" strokeDasharray="3 3" />
              <text x={sx(r.lastDay - due)} y={H - 12} fontSize={9.5} textAnchor="middle" fill="#f87171">
                last day
              </text>
              <path d={path} fill="none" stroke="#2dd4bf" strokeWidth={2} />
              <circle cx={sx(offset)} cy={sy(r.payable ? r.vf : vMin)} r={5} fill={r.payable ? "#e7e9f0" : "#f87171"} />
              <text x={36} y={sy(vMax) + 3} fontSize={9} textAnchor="end" fill="#5a6275">
                {brl(vMax)}
              </text>
              <text x={36} y={sy(vMin) + 3} fontSize={9} textAnchor="end" fill="#5a6275">
                {brl(vMin)}
              </text>
            </svg>
            <p className="text-[11px] text-faint">Dark columns = weekends/holidays for the payer. Red = after due + validadeAposVencimento (extended to a business day).</p>
          </Panel>
          <Panel title="What the payer's PSP receives (payload valor)">
            <pre className="font-mono text-[11px] text-muted">{JSON.stringify(served, null, 2)}</pre>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {r.why.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
              {r.jurosFactor !== undefined && r.jurosFactor > 0 && (
                <li className={clsx("font-mono")}>
                  • juros factor = trunc6((Ij/100)/n × Dα) = {(r.jurosFactor / 1e6).toFixed(6)} → Vj = trunc2((Vo − Va) × factor) = {brl(r.vj)}
                </li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: set the due date on a Saturday and drag the payment date to the following Monday — no juros or multa, the due date moves to the next business day. Then turn on
        the municipal holiday: the receiver&apos;s PSP only knows about it because the payer&apos;s PSP sent codMun.
      </p>
    </div>
  );
}
