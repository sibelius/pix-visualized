"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { brl, PAYEE_PSP, PAYER_PSP } from "@/components/spi/xml";

type Ledger = {
  piA: number; // Conta PI available, payer PSP (Banco Aurora)
  resA: number; // reserved in Conta PI A
  piB: number;
  resB: number;
  carla: number; // payer's account at A (available)
  carlaBlk: number;
  maria: number; // receiver's account at B (final)
  mariaProv: number; // provisional credit
  mariaBlk: number;
};

type Step = { label: string; msg?: string; apply: (l: Ledger) => Ledger; tone?: "ok" | "bad" };

const INIT: Ledger = { piA: 10000, resA: 0, piB: 5000, resB: 0, carla: 500, carlaBlk: 0, maria: 0, mariaProv: 0, mariaBlk: 0 };

const pay = (v: number): Step[] => [
  { label: `Carla confirms a Pix of ${brl(v)}; Aurora blocks it in her account`, apply: (l) => ({ ...l, carla: l.carla - v, carlaBlk: l.carlaBlk + v }) },
  { label: "SPI reserves the amount in Aurora's Conta PI", msg: "pacs.008", apply: (l) => ({ ...l, piA: l.piA - v, resA: l.resA + v }) },
  { label: "Boreal checks Maria's account, provisional credit", msg: "pacs.002 ACSP", apply: (l) => ({ ...l, mariaProv: l.mariaProv + v }) },
  { label: "SPI settles: reserve leaves Aurora's Conta PI, enters Boreal's", msg: "t4", apply: (l) => ({ ...l, resA: l.resA - v, piB: l.piB + v }), tone: "ok" },
  { label: "ACSC / ACCC: Carla's block becomes a debit, Maria's credit becomes final", msg: "pacs.002 ACSC + ACCC", apply: (l) => ({ ...l, carlaBlk: l.carlaBlk - v, mariaProv: l.mariaProv - v, maria: l.maria + v }), tone: "ok" },
];

const ret = (v: number, ok: boolean): Step[] => [
  { label: `Maria returns ${brl(v)}; Boreal blocks it in her account`, apply: (l) => ({ ...l, maria: l.maria - v, mariaBlk: l.mariaBlk + v }) },
  { label: "SPI reserves it in Boreal's Conta PI", msg: "pacs.004", apply: (l) => ({ ...l, piB: l.piB - v, resB: l.resB + v }) },
  ...(ok
    ? [
        { label: "Aurora finds the E2E, checks the total, provisional credit to Carla", msg: "pacs.002 ACSP", apply: (l: Ledger) => l },
        { label: "SPI settles the return: Boreal → Aurora", msg: "t4", apply: (l: Ledger) => ({ ...l, resB: l.resB - v, piA: l.piA + v }), tone: "ok" as const },
        { label: "Confirmations: Maria debited, Carla credited", msg: "pacs.002 ACSC + ACCC", apply: (l: Ledger) => ({ ...l, mariaBlk: l.mariaBlk - v, carla: l.carla + v }), tone: "ok" as const },
      ]
    : [
        { label: "Aurora: 30 + 50 + 30 > 100 → RJCT AM09", msg: "pacs.002 RJCT AM09", apply: (l: Ledger) => l, tone: "bad" as const },
        { label: "SPI releases the reserve; Boreal unblocks Maria", msg: "pacs.002 RJCT", apply: (l: Ledger) => ({ ...l, resB: l.resB - v, piB: l.piB + v, mariaBlk: l.mariaBlk - v, maria: l.maria + v }), tone: "bad" as const },
      ]),
];

const STEPS: Step[] = [...pay(100), ...ret(30, true), ...ret(50, true), ...ret(30, false)];

export function Conservation() {
  const [n, setN] = useState(0);
  const states = useMemo(() => {
    const out = [INIT];
    for (const s of STEPS) out.push(s.apply(out[out.length - 1]));
    return out;
  }, []);
  const l = states[n];
  const totalPI = l.piA + l.resA + l.piB + l.resB;
  const netA = l.piA + l.resA - (l.carla + l.carlaBlk);
  const netB = l.piB + l.resB - (l.maria + l.mariaBlk);
  const color = CHAPTER_COLOR.returns;

  const W = 620;
  const maxPI = 10200;
  const bar = (x: number, y: number, avail: number, res: number, max: number, w: number) => (
    <g>
      <rect x={x} y={y} width={w} height={18} rx={3} fill="#171b24" stroke="#242a38" />
      <rect x={x} y={y} width={Math.round((avail / max) * w)} height={18} rx={3} fill={color} opacity={0.55} />
      <rect x={x + Math.round((avail / max) * w)} y={y} width={Math.max(0, Math.round((res / max) * w))} height={18} fill="#fbbf24" opacity={0.9} />
    </g>
  );

  return (
    <div className="space-y-4">
      <Controls>
        <Button onClick={() => setN((v) => Math.max(0, v - 1))} disabled={n === 0}>
          ◀ Step
        </Button>
        <Button variant="primary" onClick={() => setN((v) => Math.min(STEPS.length, v + 1))} disabled={n === STEPS.length}>
          Step ▶
        </Button>
        <Button variant="ghost" onClick={() => setN(0)}>
          Reset
        </Button>
        <Button variant="ghost" onClick={() => setN(STEPS.length)}>
          End
        </Button>
        <span className="text-xs text-muted">
          step {n}/{STEPS.length}: {n === 0 ? "initial balances" : STEPS[n - 1].label}
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <Panel title="Two Conta PI at the Banco Central, two customer ledgers">
          <svg viewBox={`0 0 ${W} 212`} className="w-full" role="img" aria-label="balances">
            <text x={10} y={20} fontSize={11} fill="#e7e9f0" fontWeight={600}>
              Conta PI · {PAYER_PSP.name} ({PAYER_PSP.ispb})
            </text>
            {bar(10, 28, l.piA, l.resA, maxPI, 340)}
            <text x={360} y={42} fontSize={11} fill="#e7e9f0" fontFamily="var(--font-mono)">
              {brl(l.piA)}
              {l.resA > 0 && <tspan fill="#fbbf24"> + {brl(l.resA)} reserved</tspan>}
            </text>
            <text x={10} y={72} fontSize={11} fill="#e7e9f0" fontWeight={600}>
              Conta PI · {PAYEE_PSP.name} ({PAYEE_PSP.ispb})
            </text>
            {bar(10, 80, l.piB, l.resB, maxPI, 340)}
            <text x={360} y={94} fontSize={11} fill="#e7e9f0" fontFamily="var(--font-mono)">
              {brl(l.piB)}
              {l.resB > 0 && <tspan fill="#fbbf24"> + {brl(l.resB)} reserved</tspan>}
            </text>
            <line x1={10} x2={W - 10} y1={118} y2={118} stroke="#242a38" />
            <text x={10} y={140} fontSize={11} fill="#8a93a8">
              Carla @ Aurora
            </text>
            {bar(110, 128, l.carla, l.carlaBlk, 520, 240)}
            <text x={360} y={142} fontSize={11} fill="#e7e9f0" fontFamily="var(--font-mono)">
              {brl(l.carla)}
              {l.carlaBlk > 0 && <tspan fill="#fbbf24"> + {brl(l.carlaBlk)} blocked</tspan>}
            </text>
            <text x={10} y={178} fontSize={11} fill="#8a93a8">
              Maria @ Boreal
            </text>
            {bar(110, 166, l.maria, l.mariaBlk, 520, 240)}
            <text x={360} y={180} fontSize={11} fill="#e7e9f0" fontFamily="var(--font-mono)">
              {brl(l.maria)}
              {l.mariaBlk > 0 && <tspan fill="#fbbf24"> + {brl(l.mariaBlk)} blocked</tspan>}
              {l.mariaProv > 0 && <tspan fill="#60a5fa"> ({brl(l.mariaProv)} provisional)</tspan>}
            </text>
            {n > 0 && STEPS[n - 1].msg && (
              <text x={W - 10} y={204} fontSize={10.5} textAnchor="end" fill={STEPS[n - 1].tone === "bad" ? "#f87171" : color} fontFamily="var(--font-mono)">
                {STEPS[n - 1].msg}
              </text>
            )}
          </svg>
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
          <Stat label="Σ Conta PI (incl. reserved)" value={brl(totalPI)} tone="good" hint="never changes: the SPI only moves money" />
          <Stat label="Aurora: Conta PI − customer funds" value={brl(netA)} tone={netA === 9500 ? "good" : "warn"} hint={netA === 9500 ? "settled state" : "in flight"} />
          <Stat label="Boreal: Conta PI − customer funds" value={brl(netB)} tone={netB === 5000 ? "good" : "warn"} hint={netB === 5000 ? "settled state" : "in flight"} />
          <Stat label="Carla, net" value={brl(l.carla + l.carlaBlk - 500)} hint="−100 +30 +50 = −20" />
        </div>
      </div>
      <Panel title="Journal" bodyClassName="p-0">
        <div className="max-h-72 overflow-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <tbody>
              {STEPS.map((s, i) => (
                <tr
                  key={i}
                  onClick={() => setN(i + 1)}
                  className={clsx("cursor-pointer border-b border-line/60", i + 1 === n ? "bg-accent/10" : i + 1 > n ? "opacity-40" : "", s.tone === "bad" && "text-bad")}
                >
                  <td className="px-3 py-1.5 font-mono text-faint">{i + 1}</td>
                  <td className="px-2 py-1.5">{s.label}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-muted">{s.msg ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: step slowly and watch the yellow parts. Money is always somewhere definite: blocked in a customer account, reserved in a Conta PI, or settled. The sum of the
        two Conta PI never moves, and each PSP&apos;s Conta PI minus what it owes its customers is back to the same number whenever nothing is in flight. The rejected third
        return (AM09) reserves and then releases, leaving no trace on balances.
      </p>
    </div>
  );
}
