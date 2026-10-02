"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { ACCOUNTS, analyse, balances, block, brl, refundWalk, track, TXS, type Exclusion, type GraphParams, type Report } from "./model";

const POS: Record<string, [number, number]> = {
  V: [40, 140],
  A: [165, 140],
  B: [305, 55],
  C: [305, 150],
  D: [305, 212],
  E: [305, 262],
  F: [450, 30],
  G: [450, 98],
  H: [450, 172],
  J: [590, 30],
  I: [590, 172],
};

const WHY: Record<Exclusion, string> = {
  "below-min": "below MinTransactionAmount",
  "outside-window": "left the account after HopWindow",
  "too-deep": "deeper than MaxHops",
  "max-tx": "MaxTransactions reached",
  "not-reached": "parent not in graph",
  "not-yet": "happened after the block",
};

type Phase = "tracked" | "blocked" | "analysed" | "refunded";

export function TracingGraph() {
  const [p, setP] = useState<GraphParams>({ minAmount: 200, hopWindowMin: 120, maxHops: 2, maxTx: 5 });
  const [delay, setDelay] = useState(90);
  const [phase, setPhase] = useState<Phase>("refunded");
  const [disagreed, setDisagreed] = useState<Set<string>>(() => new Set(["T9"]));

  const { included, why } = useMemo(() => track(p, delay), [p, delay]);
  const bal = useMemo(() => balances(delay), [delay]);
  const reports = useMemo(() => {
    const blocked = block(included, delay);
    if (phase === "tracked") return blocked.map((r) => ({ ...r, blocked: 0, status: "OPEN" as const }));
    if (phase === "blocked") return blocked;
    const an = analyse(blocked, disagreed);
    return phase === "analysed" ? an : refundWalk(an, TXS[0].amount);
  }, [included, delay, phase, disagreed]);
  const rep = new Map<string, Report>(reports.map((r) => [r.txId, r]));

  const blockedTotal = reports.reduce((a, r) => a + r.blocked, 0);
  const refunded = reports.reduce((a, r) => a + (r.refunded ?? 0), 0);
  const med1 = Math.min(TXS[0].amount, Math.max(0, bal.get("A") ?? 0));

  const toggle = (id: string) => {
    const next = new Set(disagreed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDisagreed(next);
    if (phase === "tracked" || phase === "blocked") setPhase("analysed");
  };

  return (
    <div className="space-y-4">
      <Controls>
        <Slider label="victim reports after" value={delay} min={5} max={240} step={5} onChange={setDelay} format={(v) => `${v} min`} className="min-w-60 flex-1" />
        <Slider label="MinTransactionAmount" value={p.minAmount} min={0} max={2000} step={50} onChange={(v) => setP({ ...p, minAmount: v })} format={(v) => brl(v)} className="min-w-60 flex-1" />
        <Slider label="HopWindow" value={p.hopWindowMin} min={15} max={1440} step={15} onChange={(v) => setP({ ...p, hopWindowMin: v })} format={(v) => (v >= 60 ? `PT${v / 60}H` : `PT${v}M`)} className="min-w-52 flex-1" />
        <Slider label="MaxHops" value={p.maxHops} min={1} max={5} onChange={(v) => setP({ ...p, maxHops: v })} className="min-w-44" />
        <Slider label="MaxTransactions" value={p.maxTx} min={1} max={10} onChange={(v) => setP({ ...p, maxTx: v })} className="min-w-48" />
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => setP({ minAmount: 200, hopWindowMin: 120, maxHops: 2, maxTx: 5 })}>schema defaults</Button>
          <Button onClick={() => setP({ minAmount: 200, hopWindowMin: 1440, maxHops: 5, maxTx: 10 })}>spec example (PT24H, 5 hops)</Button>
        </div>
        <Segmented
          value={phase}
          onChange={setPhase}
          options={[
            { value: "tracked", label: "1 · TRACKED" },
            { value: "blocked", label: "2 · blocks" },
            { value: "analysed", label: "3 · ANALYSED" },
            { value: "refunded", label: "4 · refunds" },
          ]}
        />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel title="Tracking graph (grafo de rastreamento) of one fraudulent Pix" right={<span className="font-mono text-xs text-muted">click an edge to make that PSP disagree</span>}>
          <svg viewBox="0 0 640 290" className="w-full">
            <defs>
              <marker id="med-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#8a93a8" />
              </marker>
            </defs>
            {TXS.map((t) => {
              const [x1, y1] = POS[t.from];
              const [x2, y2] = POS[t.to];
              const r = rep.get(t.id);
              const inc = !!r;
              const ex = why.get(t.id);
              const col = !inc
                ? "#3a4152"
                : r.result === "DISAGREED"
                  ? "#f87171"
                  : r.status === "CANCELLED"
                    ? "#7f4a4a"
                    : (r.refunded ?? 0) > 0
                      ? "#34d399"
                      : "#22d3ee";
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy);
              // label sits beside the line (normal offset), not on it
              const nx = -dy / len;
              const ny = dx / len;
              const side = ny > 0 ? -1 : 1;
              const mx = Math.round((x1 + x2) / 2 + nx * 9 * side);
              const my = Math.round((y1 + y2) / 2 + ny * 9 * side);
              const sx = Math.round(x1 + (dx / len) * 30);
              const sy = Math.round(y1 + (dy / len) * 16);
              const ex2 = Math.round(x2 - (dx / len) * 32);
              const ey2 = Math.round(y2 - (dy / len) * 17);
              return (
                <g key={t.id} onClick={() => inc && toggle(t.id)} className={clsx(inc && "cursor-pointer")}>
                  <line x1={sx} y1={sy} x2={ex2} y2={ey2} stroke="transparent" strokeWidth={14} />
                  <line
                    x1={sx}
                    y1={sy}
                    x2={ex2}
                    y2={ey2}
                    stroke={col}
                    strokeWidth={inc ? 1.5 + Math.min(4, t.amount / 1500) : 1}
                    strokeDasharray={inc ? undefined : "3 4"}
                    markerEnd="url(#med-arrow)"
                  />
                  <text x={mx} y={my - 5} textAnchor="middle" fontSize={9.5} fill={inc ? "#e7e9f0" : "#5a6275"} fontFamily="ui-monospace, monospace">
                    {brl(t.amount)}
                  </text>
                  <text x={mx} y={my + 7} textAnchor="middle" fontSize={8.5} fill="#5a6275">
                    +{t.t}m{r ? ` · L${r.depth}` : ex ? ` · ${ex === "not-yet" ? "later" : "out"}` : ""}
                  </text>
                </g>
              );
            })}
            {ACCOUNTS.map((a) => {
              const [x, y] = POS[a.id];
              const blockedHere = reports.filter((r) => TXS.find((t) => t.id === r.txId)?.to === a.id).reduce((s, r) => s + r.blocked, 0);
              const col = a.kind === "victim" ? "#60a5fa" : a.kind === "cashout" ? "#a78bfa" : a.kind === "merchant" ? "#34d399" : "#f87171";
              return (
                <g key={a.id}>
                  <rect x={x - 30} y={y - 16} width={60} height={32} rx={7} fill="#11141b" stroke={col} strokeOpacity={0.7} />
                  <text x={x} y={y - 3} textAnchor="middle" fontSize={9.5} fill={col}>
                    {a.label}
                  </text>
                  <text x={x} y={y + 10} textAnchor="middle" fontSize={8.5} fill={blockedHere ? "#fbbf24" : "#5a6275"} fontFamily="ui-monospace, monospace">
                    {a.kind === "victim" ? (refunded ? `+${brl(refunded)}` : "R$ 0") : blockedHere ? `blk ${Math.round(blockedHere)}` : brl(Math.max(0, bal.get(a.id) ?? 0))}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span><span className="text-[#22d3ee]">━</span> in graph, report open/agreed</span>
            <span><span className="text-ok">━</span> refunded</span>
            <span><span className="text-bad">━</span> DISAGREED</span>
            <span><span className="text-[#7f4a4a]">━</span> auto-CANCELLED (lost connection to root)</span>
            <span><span className="text-faint">┅</span> not traced</span>
          </div>
          <p className="mt-2 text-xs text-faint">
            Try: move &quot;victim reports after&quot; from 90 to 15 minutes: the block lands before the mules forward the money, so most of it is still
            in mule A. At 4 hours the money has reached hop 3 and the cash-out: raise MaxHops and HopWindow to the spec example and watch the
            graph follow it. Click B → F to have that PSP disagree: everything downstream of F is cancelled by the DICT.
          </p>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="stolen" value={brl(TXS[0].amount)} />
            <Stat label="reports" value={included.length} hint={`depth ≤ ${p.maxHops}`} />
            <Stat label="blocked" value={brl(blockedTotal)} tone="warn" />
            <Stat label="refunded" value={brl(refunded)} tone={refunded > med1 ? "good" : "neutral"} hint={`${Math.round((refunded / TXS[0].amount) * 100)}% of the root`} />
            <Stat label="MED 1.0 (root only)" value={brl(med1)} hint="balance left in mule A" />
            <Stat label="MED 2.0 gain" value={brl(Math.max(0, refunded - med1))} tone="good" />
          </div>
          <Panel title="Refund walk (sequential, BFS order)" bodyClassName="p-0">
            <ol className="max-h-72 divide-y divide-line overflow-auto font-mono text-[11px]">
              {reports.map((r) => {
                const t = TXS.find((x) => x.id === r.txId)!;
                const to = ACCOUNTS.find((a) => a.id === t.to)!;
                return (
                  <li key={r.txId} className="px-3 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink">
                        L{r.depth} {t.from}→{t.to}
                      </span>
                      <span className={clsx(r.result === "DISAGREED" ? "text-bad" : r.status === "CANCELLED" ? "text-faint" : "text-muted")}>
                        {r.result ?? r.status}
                      </span>
                    </div>
                    <div className="text-faint">
                      {to.psp} · block {brl(r.blocked)}
                      {r.refunded !== undefined && <span className="text-ok"> · refund {brl(r.refunded)}</span>}
                    </div>
                    {r.refunded !== undefined && r.refunded > 0 && (
                      <div className="text-faint">{r.depth === 1 ? "pacs.004, reason FR01" : "pacs.008 from the PSP itself, finalidade IPRT"}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>
      </div>
      <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
        {TXS.filter((t) => why.has(t.id)).map((t) => (
          <div key={t.id} className="font-mono text-[11px] text-faint">
            {t.from}→{t.to} {brl(t.amount)} +{t.t}m: {WHY[why.get(t.id)!]}
          </div>
        ))}
      </div>
    </div>
  );
}
