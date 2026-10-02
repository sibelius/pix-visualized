"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { addMs, brl, rtrId, PAYEE_PSP, PAYER_PSP } from "@/components/spi/xml";
import { ORIGINAL, returnRules, type Original, type ReturnReason } from "./pacs004";

type Attempt = { day: number; amount: number; reason: ReturnReason; rtr: string; ok: boolean; code?: string; who?: string; bucket: "main" | "cash"; text: string };

export function PartialLedger() {
  const [kind, setKind] = useState<"IPAY" | "GSCB">("IPAY");
  const [day, setDay] = useState(2);
  const [amount, setAmount] = useState(30);
  const [reason, setReason] = useState<ReturnReason>("MD06");
  const [log, setLog] = useState<Attempt[]>([]);
  const original: Original = { ...ORIGINAL, kind, cash: kind === "GSCB" ? 40 : 0 };
  const capMain = kind === "IPAY" ? 100 : 60;
  const capCash = kind === "GSCB" ? 40 : 0;
  const ok = log.filter((a) => a.ok);
  const doneMain = ok.filter((a) => a.bucket === "main").reduce((s, a) => s + a.amount, 0);
  const doneCash = ok.filter((a) => a.bucket === "cash").reduce((s, a) => s + a.amount, 0);
  const color = CHAPTER_COLOR.returns;

  const send = (returnOfReturn = false) => {
    const bucket = reason === "SL02" ? "cash" : "main";
    const already = bucket === "cash" ? doneCash : doneMain;
    const rules = returnRules({ byOriginalPayer: returnOfReturn, original, amount, reason, prio: "HIGH", addtl: "", ustrd: "", days: day, alreadyReturned: already, seed: log.length });
    // order of checks: the SPI's own checks first (AG13, DT05), then the destination PSP's (SL02, AM09)
    const order = ["AG13", "DT05", "SL02", "AM09"];
    const fail = order.map((c) => rules.find((r) => !r.ok && r.code === c)).find(Boolean) ?? rules.find((r) => !r.ok);
    const rtr = rtrId(returnOfReturn ? PAYER_PSP.ispb : PAYEE_PSP.ispb, addMs(ORIGINAL.at, day * 86_400_000 + 3_600_000), 900 + log.length);
    setLog((l) => [
      ...l,
      {
        day,
        amount,
        reason,
        rtr,
        ok: !fail,
        code: fail?.code,
        who: fail?.who,
        bucket,
        text: returnOfReturn ? "the original payer's PSP tried to send the refund back with a pacs.004: a return of a return" : fail ? fail.text : "settled: ACSC to sender, ACCC to destination",
      },
    ]);
  };

  const W = 760;
  const X = (d: number) => Math.round(30 + (d / 120) * (W - 60));
  const barW = W - 60;

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v);
            setLog([]);
          }}
          options={[
            { value: "IPAY", label: "original: IPAY R$ 100" },
            { value: "GSCB", label: "original: Troco R$ 60 + R$ 40 cash" },
          ]}
        />
        <Segmented
          value={reason}
          onChange={setReason}
          options={[
            { value: "MD06", label: "MD06" },
            { value: "FR01", label: "FR01" },
            { value: "BE08", label: "BE08" },
            { value: "SL02", label: "SL02" },
          ]}
        />
        <Slider label="amount" value={amount} min={5} max={120} step={5} onChange={setAmount} format={brl} className="min-w-52 flex-1" />
        <Slider label="day" value={day} min={0} max={120} step={1} onChange={setDay} format={(v) => `D+${v}`} className="min-w-52 flex-1" />
        <Button variant="primary" onClick={() => send()}>
          Send pacs.004
        </Button>
        <Button onClick={() => send(true)}>Payer PSP returns the refund</Button>
        <Button variant="ghost" onClick={() => setLog([])}>
          Reset
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <Panel title="Original Pix · R$ 100,00" right={<span className="font-mono text-[11px] break-all text-faint">{ORIGINAL.e2e}</span>}>
          <svg viewBox={`0 0 ${W} 190`} className="w-full" role="img" aria-label="returnable balance and timeline">
            <text x={30} y={14} fontSize={10.5} fill="#8a93a8">
              returnable amount
            </text>
            <rect x={30} y={22} width={barW} height={26} rx={4} fill="#171b24" stroke="#242a38" />
            {(() => {
              let acc = 0;
              const total = capMain + capCash;
              const segs = ok.map((a, i) => {
                const offset = a.bucket === "cash" ? capMain : 0;
                const prior = ok.slice(0, i).filter((b) => b.bucket === a.bucket).reduce((s, b) => s + b.amount, 0);
                acc += a.amount;
                const x = 30 + ((offset + prior) / total) * barW;
                const w = (a.amount / total) * barW;
                return (
                  <g key={i}>
                    <rect x={Math.round(x)} y={22} width={Math.max(1, Math.round(w) - 1)} height={26} fill={a.bucket === "cash" ? "#fbbf24" : color} opacity={0.75} />
                    {w > 40 && (
                      <text x={Math.round(x + w / 2)} y={39} fontSize={10} textAnchor="middle" fill="#0a0c11" fontWeight={600}>
                        {a.reason} {a.amount}
                      </text>
                    )}
                  </g>
                );
              });
              return (
                <>
                  {segs}
                  {capCash > 0 && <line x1={30 + (capMain / total) * barW} x2={30 + (capMain / total) * barW} y1={18} y2={52} stroke="#e7e9f0" strokeDasharray="3 2" />}
                  {capCash > 0 && (
                    <text x={30 + (capMain / total) * barW + 4} y={62} fontSize={9.5} fill="#fbbf24">
                      cash part (SL02) →
                    </text>
                  )}
                  <text x={W - 30} y={62} fontSize={9.5} textAnchor="end" fill="#8a93a8">
                    {brl(acc)} of {brl(total)} returned
                  </text>
                </>
              );
            })()}
            <text x={30} y={92} fontSize={10.5} fill="#8a93a8">
              days since the original Pix
            </text>
            <line x1={X(0)} x2={X(120)} y1={130} y2={130} stroke="#242a38" strokeWidth={2} />
            <rect x={X(90)} y={104} width={X(120) - X(90)} height={52} fill="#f87171" opacity={0.07} />
            <line x1={X(90)} x2={X(90)} y1={100} y2={160} stroke="#f87171" strokeWidth={1.5} />
            <text x={X(90) + 4} y={110} fontSize={9.5} fill="#f87171">
              90 days: DT05
            </text>
            {[0, 30, 60, 90, 120].map((d) => (
              <text key={d} x={X(d)} y={176} fontSize={9.5} textAnchor="middle" fill="#5a6275">
                D+{d}
              </text>
            ))}
            <line x1={X(day)} x2={X(day)} y1={118} y2={142} stroke="#e7e9f0" strokeDasharray="2 2" />
            {log.map((a, i) => (
              <circle key={i} cx={X(a.day)} cy={130 + ((i % 3) - 1) * 9} r={5} fill={a.ok ? (a.bucket === "cash" ? "#fbbf24" : color) : "#f87171"} stroke="#0a0c11" />
            ))}
          </svg>
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
          <Stat label={kind === "IPAY" ? "left to return" : "purchase part left"} value={brl(capMain - doneMain)} tone={capMain - doneMain === 0 ? "warn" : "neutral"} />
          {kind === "GSCB" && <Stat label="cash part left" value={brl(capCash - doneCash)} hint="SL02, no 90-day cap" />}
          <Stat label="pacs.004 settled" value={ok.length} tone="good" />
          <Stat label="rejected" value={log.length - ok.length} tone={log.length - ok.length ? "bad" : "neutral"} />
        </div>
      </div>
      <Panel title="pacs.004 attempts against this EndToEndId" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead className="text-[10.5px] tracking-wide text-faint uppercase">
              <tr className="border-b border-line">
                <th className="px-3 py-2">RtrId</th>
                <th className="px-2 py-2">day</th>
                <th className="px-2 py-2">reason</th>
                <th className="px-2 py-2">amount</th>
                <th className="px-2 py-2">pacs.002</th>
                <th className="px-2 py-2">why</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-faint">
                    No returns yet. Send R$ 30, then R$ 50, then R$ 30 again.
                  </td>
                </tr>
              )}
              {log.map((a, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{a.rtr}</td>
                  <td className="px-2 py-1.5 font-mono">D+{a.day}</td>
                  <td className="px-2 py-1.5 font-mono">{a.reason}</td>
                  <td className="px-2 py-1.5 font-mono">{brl(a.amount)}</td>
                  <td className={clsx("px-2 py-1.5 font-mono", a.ok ? "text-ok" : "text-bad")}>{a.ok ? "ACSC" : `RJCT ${a.code}`}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {a.text}
                    {!a.ok && a.who && <span className="text-faint"> · raised by {a.who}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: return R$ 30 and then R$ 50 (both settle, R$ 20 left), then R$ 30: the original payer&apos;s PSP keeps the running total per EndToEndId and answers AM09. Move the
        day past 90 and the SPI itself refuses with DT05. Switch to Troco: the purchase part (MD06) and the cash part (SL02) are separate pots, and SL02 still works after D+90.
        A pacs.004 from the original payer&apos;s side (returning the refund) gets AG13 from the SPI.
      </p>
    </div>
  );
}
