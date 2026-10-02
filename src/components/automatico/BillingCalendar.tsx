"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { holiday, isBusinessDay, iso, pretty, short, day } from "./dates";
import { FUNDS, simulate, type CalParams, type CycleInput, type Funds } from "./calendar";

const N = 6;
const FROM = -12;
const TO = 9;
const LEFT = 118;
const W = 720;
const DW = (W - LEFT - 8) / (TO - FROM + 1);
const ROW = 46;

const DEFAULT_CYCLES: CycleInput[] = [
  { funds: "0h", payerCancel: false },
  { funds: "18h", payerCancel: false },
  { funds: "D+3", payerCancel: false },
  { funds: "0h", payerCancel: false },
  { funds: "never", payerCancel: false },
  { funds: "0h", payerCancel: true },
];

const PLANS: { value: string; label: string; plan: number[] }[] = [
  { value: "1-2-3", label: "D+1, D+2, D+3", plan: [1, 2, 3] },
  { value: "2-4-7", label: "D+2, D+4, D+7", plan: [2, 4, 7] },
  { value: "7", label: "D+7 only", plan: [7] },
  { value: "3-6-9", label: "D+3, D+6, D+9 ✗", plan: [3, 6, 9] },
];

const STATUS_TONE: Record<string, string> = {
  CONCLUIDA: "text-ok",
  EXPIRADA: "text-bad",
  REJEITADA: "text-bad",
  CANCELADA: "text-warn",
  ATIVA: "text-info",
  CRIADA: "text-muted",
  "—": "text-faint",
};

const EV_COLOR = { api: "#a3e635", msg: "#a78bfa", ok: "#34d399", fail: "#f87171", notify: "#22d3ee", cancel: "#fbbf24", info: "#8a93a8" };

const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;

export function BillingCalendar() {
  const [fixed, setFixed] = useState<"fixo" | "variavel">("variavel");
  const [base, setBase] = useState(149.9);
  const [max, setMax] = useState(200);
  const [lead, setLead] = useState(5);
  const [ajuste, setAjuste] = useState<"on" | "off">("on");
  const [retries, setRetries] = useState<"PERMITE_3R_7D" | "NAO_PERMITE">("PERMITE_3R_7D");
  const [plan, setPlan] = useState("2-4-7");
  const [authCancel, setAuthCancel] = useState(0);
  const [cycles, setCycles] = useState<CycleInput[]>(DEFAULT_CYCLES);
  const [sel, setSel] = useState(2);

  const params: CalParams = {
    first: day(2026, 11, 15),
    cycles: N,
    fixed: fixed === "fixo",
    base,
    max,
    lead,
    ajusteDiaUtil: ajuste === "on",
    retries: retries === "PERMITE_3R_7D",
    retryPlan: PLANS.find((p) => p.value === plan)!.plan,
    authCancelAt: authCancel === 0 ? -1 : authCancel - 1,
    perCycle: cycles,
  };
  const out = useMemo(() => simulate(params), [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = out[sel];

  const setCycle = (k: number, patch: Partial<CycleInput>) => setCycles((cs) => cs.map((c, i) => (i === k ? { ...c, ...patch } : c)));
  const paid = out.filter((c) => c.status === "CONCLUIDA");
  const collected = paid.reduce((a, c) => a + c.amount, 0);
  const attempts = out.reduce((a, c) => a + c.tentativas.length, 0);
  const H = 30 + N * ROW + 8;
  const x = (off: number) => Math.round((LEFT + (off - FROM) * DW) * 10) / 10;

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          amount
          <Segmented value={fixed} onChange={setFixed} options={[{ value: "fixo", label: "fixed" }, { value: "variavel", label: "variable (bill)" }]} />
        </span>
        <Slider label="base amount" value={base} min={20} max={400} step={0.1} onChange={setBase} format={(v) => `R$ ${v.toFixed(2)}`} className="min-w-52 flex-1" />
        {fixed === "variavel" && (
          <Slider label="payer valor máximo" value={max} min={50} max={600} step={10} onChange={setMax} format={(v) => `R$ ${v.toFixed(0)}`} className="min-w-52 flex-1" />
        )}
        <Slider label="pain.013 lead (D−k)" value={lead} min={0} max={12} onChange={setLead} format={(v) => `D−${v}`} className="min-w-52 flex-1" />
      </Controls>
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          ajusteDiaUtil
          <Segmented value={ajuste} onChange={setAjuste} options={[{ value: "on", label: "true" }, { value: "off", label: "false" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          politicaRetentativa
          <Segmented value={retries} onChange={setRetries} options={[{ value: "PERMITE_3R_7D", label: "PERMITE_3R_7D" }, { value: "NAO_PERMITE", label: "NAO_PERMITE" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          receiver&apos;s NTAG plan
          <Segmented value={plan} onChange={setPlan} options={PLANS.map((p) => ({ value: p.value, label: p.label }))} />
        </span>
        <Slider
          label="payer cancels authorization before cycle"
          value={authCancel}
          min={0}
          max={N}
          onChange={setAuthCancel}
          format={(v) => (v === 0 ? "never" : `#${v}`)}
          className="min-w-64 flex-1"
        />
      </Controls>

      <Panel title="Six monthly cycles — first due date Sun 15 Nov 2026 (a holiday)" right={<span className="font-mono text-[11px] text-faint">x-axis: days relative to settlement date D</span>}>
        <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px] select-none">
          {Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i).map((off) => (
            <text key={off} x={x(off) + DW / 2} y={14} fontSize={8.5} textAnchor="middle" fill={off === 0 ? "#e7e9f0" : "#5a6275"} fontFamily="ui-monospace, monospace">
              {off === 0 ? "D" : off > 0 ? `+${off}` : off}
            </text>
          ))}
          {out.map((c, r) => {
            const y = 26 + r * ROW;
            const active = r === sel;
            return (
              <g key={r} onClick={() => setSel(r)} style={{ cursor: "pointer" }}>
                <rect x={2} y={y} width={W - 4} height={ROW - 6} rx={6} fill={active ? "#171b24" : "transparent"} stroke={active ? "#34d399" : "#242a38"} strokeOpacity={active ? 0.7 : 0.6} />
                <text x={10} y={y + 15} fontSize={11} fill="#e7e9f0">
                  #{r + 1} {short(c.due)}
                </text>
                <text x={10} y={y + 30} fontSize={9.5} fill={c.status === "CONCLUIDA" ? "#34d399" : c.status === "CANCELADA" ? "#fbbf24" : c.status === "—" ? "#5a6275" : "#f87171"} fontFamily="ui-monospace, monospace">
                  {c.status === "—" ? "no cobr" : c.status} {c.amount ? `R$${c.amount.toFixed(0)}` : ""}
                </text>
                {/* day cells: non-business shading */}
                {Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i).map((off) => {
                  const d = c.due + off;
                  const nb = !isBusinessDay(d);
                  return nb ? <rect key={off} x={x(off) + 0.5} y={y + 3} width={DW - 1} height={ROW - 12} fill="#ffffff" opacity={0.035} /> : null;
                })}
                {/* allowed send window D-10..D-2 */}
                <rect x={x(-10)} y={y + 6} width={x(-1) - x(-10)} height={6} rx={3} fill="#34d399" opacity={0.25} />
                {/* nominal due if different */}
                {c.nominal !== c.due && <circle cx={x(c.nominal - c.due) + DW / 2} cy={y + 24} r={3} fill="none" stroke="#8a93a8" />}
                {/* D column */}
                <rect x={x(0) + 1} y={y + 3} width={DW - 2} height={ROW - 12} fill="none" stroke="#e7e9f0" strokeOpacity={0.35} rx={3} />
                {/* 7-day retry limit */}
                {c.status !== "—" && <line x1={x(8)} y1={y + 3} x2={x(8)} y2={y + ROW - 9} stroke="#fbbf24" strokeDasharray="2 3" opacity={0.6} />}
                {/* next cycle start */}
                {c.nextStart - c.due <= TO && <line x1={x(c.nextStart - c.due)} y1={y + 2} x2={x(c.nextStart - c.due)} y2={y + ROW - 8} stroke="#f87171" opacity={0.7} />}
                {/* pain.013 */}
                {c.sentAt !== null && (
                  <g>
                    <path
                      d={`M${x(c.sentAt - c.due) + DW / 2} ${y + 16} l5 6 l-5 6 l-5 -6 z`}
                      fill={c.rejectCode ? "#f87171" : "#a78bfa"}
                      transform={c.sentAt - c.due < FROM ? `translate(${x(FROM) - x(c.sentAt - c.due)} 0)` : undefined}
                    />
                  </g>
                )}
                {c.tentativas.map((t, i) => {
                  const cx = x(t.date - c.due) + DW / 2;
                  const cy = y + 24;
                  const col = t.status === "PAGA" ? "#34d399" : t.status === "EXPIRADA" ? "#f87171" : t.status === "CANCELADA" ? "#fbbf24" : t.status === "REJEITADA" ? "#f87171" : "#22d3ee";
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={cy} r={7} fill={t.status === "PAGA" ? col : "#0a0c11"} stroke={col} strokeWidth={1.6} />
                      {t.status === "EXPIRADA" && <path d={`M${cx - 3} ${cy - 3} l6 6 m0 -6 l-6 6`} stroke={col} strokeWidth={1.6} />}
                      <text x={cx} y={cy + 17} fontSize={7.5} textAnchor="middle" fill="#5a6275" fontFamily="ui-monospace, monospace">
                        {t.tipo}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
          <span>
            <span className="mr-1 inline-block h-1.5 w-5 rounded bg-ok/40 align-middle" />
            pain.013 window D−10…D−2
          </span>
          <span>
            <span className="text-[#a78bfa]">◆</span> pain.013 sent
          </span>
          <span>
            <span className="text-ok">●</span> paid · <span className="text-bad">⊗</span> expired · <span className="text-warn">○</span> cancelled
          </span>
          <span>
            <span className="text-warn">┆</span> D+7 retry limit · <span className="text-bad">│</span> next cycle starts
          </span>
          <span>shaded = weekend/holiday</span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel
          title={`Cycle #${sel + 1}: due ${pretty(cur.nominal)}${cur.due !== cur.nominal ? ` → settles ${pretty(cur.due)}` : ""}${holiday(cur.nominal) ? ` (${holiday(cur.nominal)})` : ""}`}
          right={<span className={clsx("font-mono text-xs", STATUS_TONE[cur.status])}>cobr.status {cur.status}</span>}
          bodyClassName="max-h-[26rem] overflow-y-auto"
        >
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            payer balance arrives
            <Segmented value={cycles[sel].funds} onChange={(v: Funds) => setCycle(sel, { funds: v })} options={FUNDS.map((f) => ({ value: f, label: f }))} />
            <Button onClick={() => setCycle(sel, { payerCancel: !cycles[sel].payerCancel })} className="!px-2 !py-1 !text-xs">
              {cycles[sel].payerCancel ? "✓ payer cancels this debit" : "payer cancels this debit"}
            </Button>
          </div>
          <ol className="space-y-1.5 text-[12.5px]">
            {cur.events
              .slice()
              .sort((a, b) => a.day - b.day || a.h - b.h)
              .map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-28 shrink-0 font-mono text-[11px] text-faint">
                    {iso(e.day).slice(5)} {hh(e.h)}
                  </span>
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: EV_COLOR[e.kind] }} />
                  <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{e.text}</span>
                </li>
              ))}
          </ol>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="paid cycles" value={`${paid.length}/${N}`} tone={paid.length === N ? "good" : "warn"} />
            <Stat label="collected" value={`R$ ${collected.toFixed(2)}`} />
            <Stat label="pain.013 sent" value={attempts} hint="AGND + NTAG" />
            <Stat label="rejected (pain.014)" value={out.filter((c) => c.status === "REJEITADA").length} tone={out.some((c) => c.status === "REJEITADA") ? "bad" : undefined} />
          </div>
          <Panel title="tentativas of this cycle">
            {cur.tentativas.length === 0 ? (
              <p className="text-sm text-faint">none</p>
            ) : (
              <table className="w-full font-mono text-[11px]">
                <thead className="text-faint">
                  <tr>
                    <th className="text-left font-normal">dataLiquidacao</th>
                    <th className="text-left font-normal">tipo</th>
                    <th className="text-left font-normal">status</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.tentativas.map((t, i) => (
                    <tr key={i}>
                      <td>{iso(t.date)}</td>
                      <td>{t.tipo}</td>
                      <td className={t.status === "PAGA" ? "text-ok" : t.status === "AGENDADA" ? "text-info" : "text-bad"}>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: drag the pain.013 lead to D−1 or D−11 and every cycle is rejected; lower the valor máximo until cycle #4&apos;s bill spike is refused (and note it is
        checked at scheduling, not at settlement); switch to NAO_PERMITE and cycle #3 is lost; pick the D+3/6/9 plan and see the third retry fall outside the 7-day
        window.
      </p>
    </div>
  );
}
