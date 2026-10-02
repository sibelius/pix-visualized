"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Callout, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { MACHINES, devolucaoCheck, type Machine, type MState } from "./machines";

const W = 600;
const H = 250;
const boxW = (s: MState) => Math.round(Math.max(70, s.id.length * 6.6 + 18));

function Graph({ m, cur, lastEdge }: { m: Machine; cur: string; lastEdge: number | null }) {
  const byId = new Map(m.states.map((s) => [s.id, s]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
      <defs>
        <marker id="api-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#5a6275" />
        </marker>
        <marker id="api-arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#a3e635" />
        </marker>
      </defs>
      {m.edges.map((e, i) => {
        const a = byId.get(e.from)!;
        const b = byId.get(e.to)!;
        const hot = lastEdge === i;
        const stroke = hot ? "#a3e635" : "#3a4256";
        if (a === b) {
          const selfIdx = m.edges.filter((x, j) => j < i && x.from === x.to && x.from === e.from).length;
          const r = 14;
          const x0 = a.x - 34 + selfIdx * 44;
          return (
            <path
              key={i}
              d={`M${x0},${a.y - 13} C${x0 - r},${a.y - 13 - 2.4 * r} ${x0 + r + 18},${a.y - 13 - 2.4 * r} ${x0 + 18},${a.y - 13}`}
              fill="none"
              stroke={stroke}
              strokeWidth={hot ? 2 : 1.2}
              markerEnd={`url(#${hot ? "api-arr-hot" : "api-arr"})`}
            />
          );
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        // shorten to box edges (approx.)
        const sa = Math.min(boxW(a) / 2 / Math.max(Math.abs(ux), 1e-3), 13 / Math.max(Math.abs(uy), 1e-3));
        const sb = Math.min(boxW(b) / 2 / Math.max(Math.abs(ux), 1e-3), 13 / Math.max(Math.abs(uy), 1e-3));
        return (
          <line
            key={i}
            x1={Math.round(a.x + ux * sa)}
            y1={Math.round(a.y + uy * sa)}
            x2={Math.round(b.x - ux * (sb + 2))}
            y2={Math.round(b.y - uy * (sb + 2))}
            stroke={stroke}
            strokeWidth={hot ? 2 : 1.2}
            markerEnd={`url(#${hot ? "api-arr-hot" : "api-arr"})`}
          />
        );
      })}
      {m.states.map((s) => {
        const w = boxW(s);
        const on = s.id === cur;
        return (
          <g key={s.id}>
            <rect
              x={Math.round(s.x - w / 2)}
              y={s.y - 13}
              width={w}
              height={26}
              rx={s.final ? 4 : 13}
              fill={on ? "#1d2a12" : "#171b24"}
              stroke={on ? "#a3e635" : s.final ? "#5a6275" : "#8a93a8"}
              strokeWidth={on ? 2 : 1}
              strokeDasharray={s.id === "SOLICITADA" ? "3 3" : undefined}
            />
            {s.final && <rect x={Math.round(s.x - w / 2) + 3} y={s.y - 10} width={w - 6} height={20} rx={3} fill="none" stroke={on ? "#a3e635" : "#3a4256"} strokeWidth={0.8} />}
            <text x={s.x} y={s.y + 3.5} fontSize={10.5} textAnchor="middle" fill={on ? "#e7e9f0" : "#8a93a8"} fontFamily="var(--font-mono, monospace)">
              {s.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CobvWindow() {
  const [dayOff, setDayOff] = useState(-5);
  const [vav, setVav] = useState(30);
  const [kind, setKind] = useState<"cob" | "cobv">("cobv");
  const [exp, setExp] = useState(3600);
  const [age, setAge] = useState(1800);
  const min = -15;
  const max = 45;
  const X = (d: number) => Math.round(20 + ((d - min) / (max - min)) * 560);
  const payable = kind === "cobv" ? dayOff <= vav : age <= exp;
  const phase = kind === "cobv" ? (dayOff < 0 ? "before due: descontos may apply" : dayOff === 0 ? "due date: valor.original" : dayOff <= vav ? "overdue: multa + juros apply" : "past validadeAposVencimento") : "";
  return (
    <div className="space-y-3">
      <Controls>
        <Segmented value={kind} onChange={setKind} options={[{ value: "cob", label: "cob (expiracao)" }, { value: "cobv", label: "cobv (vencimento)" }]} />
        {kind === "cobv" ? (
          <>
            <Slider label="DPP vs due date" value={dayOff} min={min} max={max} onChange={setDayOff} format={(v) => `${v > 0 ? "+" : ""}${v} d`} className="min-w-56 flex-1" />
            <Slider label="validade após venc." value={vav} min={0} max={40} onChange={setVav} format={(v) => `${v} d`} className="min-w-56 flex-1" />
          </>
        ) : (
          <>
            <Slider label="calendario.expiracao" value={exp} min={60} max={86400} step={60} onChange={setExp} format={(v) => `${v} s`} className="min-w-56 flex-1" />
            <Slider label="time since criacao" value={age} min={0} max={90000} step={60} onChange={setAge} format={(v) => `${Math.round(v / 60)} min`} className="min-w-56 flex-1" />
          </>
        )}
      </Controls>
      {kind === "cobv" && (
        <svg viewBox="0 0 600 70" className="w-full">
          <rect x={X(min)} y={28} width={X(0) - X(min)} height={12} fill="#34d399" opacity={0.25} />
          <rect x={X(0)} y={28} width={X(Math.min(vav, max)) - X(0)} height={12} fill="#fbbf24" opacity={0.3} />
          <rect x={X(Math.min(vav, max))} y={28} width={X(max) - X(Math.min(vav, max))} height={12} fill="#f87171" opacity={0.18} />
          <line x1={X(0)} x2={X(0)} y1={20} y2={48} stroke="#e7e9f0" />
          <text x={X(0)} y={14} fontSize={10} textAnchor="middle" fill="#e7e9f0">
            dataDeVencimento
          </text>
          <text x={X(Math.min(vav, max))} y={62} fontSize={10} textAnchor="middle" fill="#fbbf24">
            + {vav} d corridos
          </text>
          <circle cx={X(dayOff)} cy={34} r={6} fill={payable ? "#a3e635" : "#f87171"} />
          <text x={X(dayOff)} y={62} fontSize={10} textAnchor="middle" fill="#8a93a8">
            {dayOff === Math.min(vav, max) ? "" : "DPP"}
          </text>
        </svg>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="record status" value="ATIVA" hint="unchanged by time" />
        <Stat label="payable?" value={payable ? "yes" : "no"} tone={payable ? "good" : "bad"} hint={kind === "cobv" ? phase : age > exp ? "expired: payer PSP must refuse" : "within expiracao"} />
        <Stat label="location answers" value={payable ? "200 JWS" : "404/410 or JWS"} tone={payable ? "good" : "warn"} hint="PSP's choice when unpayable" />
      </div>
      <p className="text-xs text-faint">
        Try: drag the DPP past the yellow window — the cobv is no longer payable but its record is still ATIVA. If the due date or the end of the window falls on a weekend/holiday for the payer, it rolls to the next business day (not drawn).
      </p>
    </div>
  );
}

function DevolucaoLab() {
  const [valor, setValor] = useState(40);
  const [days, setDays] = useState(5);
  const [natureza, setNat] = useState<"ORIGINAL" | "RETIRADA">("ORIGINAL");
  const [prior, setPrior] = useState<{ v: number; st: "DEVOLVIDO" | "NAO_REALIZADO" | "EM_PROCESSAMENTO" }[]>([{ v: 30, st: "DEVOLVIDO" }]);
  const counted = prior.filter((p) => p.st !== "NAO_REALIZADO").map((p) => p.v);
  const r = devolucaoCheck({ pixValor: 100, prior: counted, valor, days, natureza, saque: false });
  return (
    <div className="space-y-3">
      <Controls>
        <Slider label="devolucao.valor" value={valor} min={0} max={120} onChange={setValor} format={(v) => `${v.toFixed(2)}`} className="min-w-52 flex-1" />
        <Slider label="days since settlement" value={days} min={0} max={120} onChange={setDays} format={(v) => `${v} d`} className="min-w-52 flex-1" />
        <Segmented value={natureza} onChange={setNat} options={[{ value: "ORIGINAL", label: "ORIGINAL" }, { value: "RETIRADA", label: "RETIRADA" }]} />
      </Controls>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <div className="font-mono text-xs text-muted">Pix E8765…d4e5f · valor 100.00 · Pix comum</div>
          {prior.map((p, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-line bg-panel-2/50 px-2 py-1 font-mono text-[11px]">
              <span className="text-muted">devolução #{i + 1}</span>
              <span className="text-ink">{p.v.toFixed(2)}</span>
              <span className={p.st === "DEVOLVIDO" ? "text-ok" : p.st === "NAO_REALIZADO" ? "text-bad" : "text-warn"}>{p.st}</span>
              {p.st === "NAO_REALIZADO" && <span className="text-faint">(does not count)</span>}
              {p.st === "EM_PROCESSAMENTO" && (
                <span className="ml-auto flex gap-1">
                  <button type="button" className="rounded border border-ok/40 px-1.5 text-ok" onClick={() => setPrior((xs) => xs.map((x, j) => (j === i ? { ...x, st: "DEVOLVIDO" } : x)))}>
                    settle
                  </button>
                  <button type="button" className="rounded border border-bad/40 px-1.5 text-bad" onClick={() => setPrior((xs) => xs.map((x, j) => (j === i ? { ...x, st: "NAO_REALIZADO" } : x)))}>
                    fail
                  </button>
                </span>
              )}
            </div>
          ))}
          <div className={clsx("rounded-md border px-2 py-1.5 text-xs", r.ok ? "border-ok/40 text-ok" : "border-bad/40 text-bad")}>
            {r.ok ? (
              <>201 Created · status EM_PROCESSAMENTO · rtrId D12345678…</>
            ) : (
              <>
                400 <span className="font-mono">PixDevolucaoInvalida</span>: {r.errs.join("; ")}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!r.ok} onClick={() => setPrior((xs) => [...xs, { v: valor, st: "EM_PROCESSAMENTO" }])}>
              PUT devolução
            </Button>
            <Button variant="ghost" onClick={() => setPrior([{ v: 30, st: "DEVOLVIDO" }])}>
              Reset
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Stat label="still refundable" value={r.remaining.toFixed(2)} />
          <Stat label="window" value={days <= 90 ? `${90 - days} d left` : "closed"} tone={days <= 90 ? "neutral" : "bad"} hint="90 days from original settlement" />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: refund 40, fail it, then refund 70 — a NAO_REALIZADO refund does not consume the balance. Natureza MED_OPERACIONAL / MED_FRAUDE / MED_PIX_AUTOMATICO appear in responses but cannot be requested by you: they come from MED (BE08, FR01, REFU).
      </p>
    </div>
  );
}

export function Lifecycle() {
  const [key, setKey] = useState("cob");
  const m = MACHINES.find((x) => x.key === key)!;
  const [cur, setCur] = useState(m.start);
  const [last, setLast] = useState<number | null>(null);
  const [revisao, setRev] = useState(0);
  const [trail, setTrail] = useState<string[]>([]);
  const pick = (k: string) => {
    const mm = MACHINES.find((x) => x.key === k)!;
    setKey(k);
    setCur(mm.start);
    setLast(null);
    setRev(0);
    setTrail([]);
  };
  const st = m.states.find((s) => s.id === cur)!;
  return (
    <div className="space-y-4">
      <Controls>
        <Segmented value={key} onChange={pick} options={MACHINES.map((x) => ({ value: x.key, label: x.title }))} />
        <Button variant="ghost" onClick={() => pick(key)}>
          Reset
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title={`${m.title} — click a transition`}>
          <Graph m={m} cur={cur} lastEdge={last} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.edges.map((e, i) => {
              const ok = e.from === cur;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!ok}
                  onClick={() => {
                    setCur(e.to);
                    setLast(i);
                    if (e.label.includes("revisao")) setRev((r) => r + 1);
                    setTrail((t) => [`${e.from} → ${e.to}  (${e.via})`, ...t].slice(0, 5));
                  }}
                  className={clsx(
                    "rounded-md border px-2 py-1 text-left text-[11.5px]",
                    ok ? "border-line bg-panel-2 text-ink hover:border-[#a3e635]" : "border-line/50 text-faint opacity-50",
                  )}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </Panel>
        <div className="space-y-3">
          <Stat label="status" value={<span className="text-sm break-all">{cur}</span>} tone={st.final ? "warn" : "good"} hint={st.note} />
          {key === "cob" && <Stat label="revisao" value={revisao} hint="incremented on PUT/PATCH that changes a field (not loc)" />}
          <div className="rounded-lg border border-line bg-panel-2/60 px-3 py-2 font-mono text-[11px] text-muted">
            {trail.length === 0 ? <span className="text-faint">no transitions yet</span> : trail.map((t, i) => <div key={i}>{t}</div>)}
          </div>
          <Callout tone="info">{m.hint}</Callout>
        </div>
      </div>
      {key === "cob" && (
        <Panel title="Expired is not a status: payable window vs record status">
          <CobvWindow />
        </Panel>
      )}
      {key === "dev" && (
        <Panel title="Devolução admission rules (PUT /pix/{e2eid}/devolucao/{id})">
          <DevolucaoLab />
        </Panel>
      )}
      <p className="text-xs text-faint">Try: on cob, fire &quot;expiracao elapses&quot; — nothing changes; then pay it and notice every other button greys out (CONCLUIDA is final). Switch to devolução and rec/cobr for the other machines.</p>
    </div>
  );
}
