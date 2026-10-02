"use client";

import { useState } from "react";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { apply, enabled, EVENTS, initL, REC_STATES, SOLIC_STATES, type LState, type RecStatus, type SolicStatus } from "./lifecycleModel";

const REC_POS: Record<RecStatus, [number, number]> = {
  CRIADA: [90, 70],
  APROVADA: [300, 70],
  REJEITADA: [90, 150],
  CANCELADA: [520, 150],
  EXPIRADA: [520, 30],
};
const REC_EDGES: [RecStatus, RecStatus, string][] = [
  ["CRIADA", "APROVADA", "pain.012 CFDB"],
  ["CRIADA", "REJEITADA", "AP13/AP14"],
  ["CRIADA", "CANCELADA", ""],
  ["APROVADA", "CANCELADA", "pain.011"],
  ["APROVADA", "EXPIRADA", "dataFinal"],
];
const SOL_X = (k: number) => 48 + k * 91;

const WHO_COLOR = { receiver: "#a3e635", payer: "#22d3ee", psp: "#a78bfa", time: "#fbbf24" };

export function Lifecycle() {
  const [s, setS] = useState<LState>(initL);
  const fire = (id: (typeof EVENTS)[number]["id"]) => setS((x) => apply(x, id));
  const terminal = s.rec !== "CRIADA" && s.rec !== "APROVADA";

  const node = (x: number, y: number, label: string, active: boolean, color: string, w = 104) => (
    <g key={label + x}>
      <rect x={x - w / 2} y={y - 15} width={w} height={30} rx={15} fill={active ? `${color}26` : "#171b24"} stroke={active ? color : "#242a38"} strokeWidth={active ? 2 : 1} />
      <text x={x} y={y + 4} fontSize={11} textAnchor="middle" fill={active ? "#e7e9f0" : "#8a93a8"} fontFamily="ui-monospace, monospace">
        {label}
      </text>
    </g>
  );

  return (
    <div className="space-y-4">
      <Controls>
        {(["receiver", "payer", "psp", "time"] as const).map((who) => (
          <div key={who} className="flex flex-wrap items-center gap-2">
            <span className="w-16 font-mono text-[11px]" style={{ color: WHO_COLOR[who] }}>
              {who}
            </span>
            {EVENTS.filter((e) => e.who === who).map((e) => (
              <Button key={e.id} onClick={() => fire(e.id)} disabled={!enabled(s, e.id)} className="!px-2 !py-1 !text-xs">
                {e.label}
              </Button>
            ))}
          </div>
        ))}
        <Button variant="ghost" onClick={() => setS(initL())}>
          Reset
        </Button>
      </Controls>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="rec.status and solicrec.status">
          <svg viewBox="0 0 640 290" className="w-full select-none">
            <defs>
              <marker id="lc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#5a6275" />
              </marker>
            </defs>
            <text x={10} y={14} fontSize={10} fill="#5a6275">
              recorrência (rec)
            </text>
            {REC_EDGES.map(([a, b, l]) => {
              const [x1, y1] = REC_POS[a];
              const [x2, y2] = REC_POS[b];
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy);
              const ux = dx / len;
              const uy = dy / len;
              return (
                <g key={a + b}>
                  <line x1={Math.round(x1 + ux * 56)} y1={Math.round(y1 + uy * 16)} x2={Math.round(x2 - ux * 56)} y2={Math.round(y2 - uy * 16)} stroke="#5a6275" markerEnd="url(#lc-arrow)" />
                  {l && (
                    <text x={Math.round((x1 + x2) / 2)} y={Math.round((y1 + y2) / 2) - 6} fontSize={9.5} textAnchor="middle" fill="#5a6275" fontFamily="ui-monospace, monospace">
                      {l}
                    </text>
                  )}
                </g>
              );
            })}
            {REC_STATES.map((r) => node(REC_POS[r][0], REC_POS[r][1], r, s.rec === r, r === "APROVADA" ? "#34d399" : r === "CRIADA" ? "#fbbf24" : "#f87171"))}

            <text x={10} y={206} fontSize={10} fill="#5a6275">
              solicitação de confirmação (solicrec, Jornada 1 only)
            </text>
            <line x1={SOL_X(0)} y1={240} x2={SOL_X(6)} y2={240} stroke="#242a38" />
            {SOLIC_STATES.map((st, k) =>
              node(SOL_X(k), 240, st as SolicStatus, s.solic === st, k === 3 ? "#34d399" : k < 3 ? "#a78bfa" : "#f87171", 84),
            )}
          </svg>
          <p className="mt-1 text-xs text-faint">
            The API names (CRIADA, APROVADA…) map onto pain.012 MandateStatus codes: pending = PDNG, confirmed by payer = CFDB, cancelled = CCLD.
          </p>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="rec.status" value={s.rec} tone={s.rec === "APROVADA" ? "good" : terminal ? "bad" : "warn"} />
            <Stat label="solicrec" value={s.solic} />
            <Stat label="can send cobr?" value={s.rec === "APROVADA" ? "yes" : "no"} tone={s.rec === "APROVADA" ? "good" : "bad"} />
            <Stat label="scheduled debits" value={s.scheduled} />
          </div>
          <Panel title="message log" bodyClassName="max-h-72 overflow-y-auto p-3">
            <ol className="space-y-2 text-[12px]">
              {s.log
                .slice()
                .reverse()
                .map((l, k) => (
                  <li key={k}>
                    <div className="font-mono text-ink">
                      <span className="text-faint">{l.t}</span> {l.msg}
                    </div>
                    <div className="text-muted">{l.note}</div>
                  </li>
                ))}
            </ol>
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: start a Jornada 1 request, then — while it is still pending — have the payer confirm via a QR Code instead; or approve, schedule two cobranças and
        cancel as the payer, and watch the camt.055 CCLD fan-out.
      </p>
    </div>
  );
}
