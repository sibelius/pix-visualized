"use client";

import { useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { LineChart } from "@/components/viz/Chart";
import { fmt } from "@/lib/random";
import { genPayments, netPositions, rtgsNeed, runRtgs, unwind } from "./settlement";

const COLORS = ["#32bcad", "#818cf8", "#f472b6", "#f5a524", "#22d3ee", "#a3e635", "#fb923c", "#e879f9"];
const NAME = (k: number) => `PSP ${String.fromCharCode(65 + k)}`;
const brl = (v: number) => (Math.abs(v) >= 1e6 ? `R$ ${fmt(v / 1e6, 2)}M` : Math.abs(v) >= 1e3 ? `R$ ${fmt(v / 1e3, 1)}k` : `R$ ${fmt(v)}`);

export function RtgsVsDns() {
  const [nBanks, setN] = useState(5);
  const [nPay, setP] = useState(400);
  const [skew, setSkew] = useState(0.5);
  const [seed, setSeed] = useState(7);
  const [timing, setTiming] = useState(0.6);
  const [funding, setFunding] = useState(100);
  const [failed, setFailed] = useState<string>("none");

  const ps = useMemo(() => genPayments(nBanks, nPay, skew, seed, timing), [nBanks, nPay, skew, seed, timing]);
  const need = useMemo(() => rtgsNeed(nBanks, ps), [nBanks, ps]);
  const net = useMemo(() => netPositions(nBanks, ps), [nBanks, ps]);
  const opening = need.map((v) => Math.round((v * funding) / 100));
  const run = useMemo(() => runRtgs(nBanks, ps, opening), [nBanks, ps, opening.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = failed === "none" ? -1 : Number(failed);
  const uw = f >= 0 && f < nBanks ? unwind(nBanks, ps, f) : null;

  const gross = ps.reduce((a, p) => a + p.amount, 0);
  const rtgsLiq = need.reduce((a, b) => a + b, 0);
  const dnsLiq = net.reduce((a, b) => a + Math.max(0, -b), 0);

  const series = run.paths.map((pts, k) => ({ id: `b${k}`, label: NAME(k), color: COLORS[k], points: pts, step: true }));

  return (
    <div className="space-y-4">
      <Controls>
        <Slider label="PSPs" value={nBanks} min={3} max={8} step={1} onChange={setN} format={(v) => String(v)} className="min-w-40" />
        <Slider label="payments" value={nPay} min={20} max={1000} step={10} onChange={setP} format={(v) => String(v)} className="min-w-48" />
        <Slider label="concentration" value={skew} min={0} max={1} step={0.05} onChange={setSkew} format={(v) => v.toFixed(2)} className="min-w-48" />
        <Slider label="intraday timing mismatch" value={timing} min={0} max={1} step={0.05} onChange={setTiming} format={(v) => v.toFixed(2)} className="min-w-56" />
        <Button onClick={() => setSeed((s) => s + 1)}>New day</Button>
      </Controls>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="RTGS: Conta PI balances, payment by payment"
          right={
            <span className="font-mono text-xs text-muted">
              pre-funded at <span className={funding < 100 ? "text-warn" : "text-ok"}>{funding}%</span> of need
            </span>
          }
        >
          <LineChart series={series} xLabel="payment #" yLabel="balance (R$)" height={280} yFormat={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
          <div className="mt-3">
            <Slider label="opening balance (% of each PSP's RTGS need)" value={funding} min={0} max={150} step={5} onChange={setFunding} format={(v) => `${v}%`} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Each PSP needs enough opening balance to survive its worst run of outgoing payments before incoming ones arrive. Below 100%, the SPI
            does not queue: an order without funds in the Conta PI is rejected on the spot (pacs.002 RJCT AM04).
          </p>
        </Panel>

        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="gross value" value={brl(gross)} hint={`${nPay} payments`} />
            <Stat label="RTGS liquidity" value={brl(rtgsLiq)} hint={`${fmt((rtgsLiq / gross) * 100, 1)}% of gross`} />
            <Stat label="DNS liquidity" value={brl(dnsLiq)} hint={`${fmt((dnsLiq / gross) * 100, 1)}% of gross · ${fmt((dnsLiq / Math.max(1, rtgsLiq)) * 100, 0)}% of RTGS`} tone="good" />
            <Stat label="rejected (AM04)" value={run.rejected} tone={run.rejected ? "bad" : "good"} hint={run.rejected ? brl(run.rejectedValue) : "all settled"} />
          </div>
          <Panel title="Per PSP: what each model needs">
            <table className="w-full text-left text-xs">
              <thead className="text-faint">
                <tr>
                  <th className="pb-1 font-normal" />
                  <th className="pb-1 text-right font-normal">RTGS need</th>
                  <th className="pb-1 text-right font-normal">DNS net</th>
                  {uw && <th className="pb-1 text-right font-normal">after unwind</th>}
                </tr>
              </thead>
              <tbody className="font-mono">
                {need.map((v, k) => {
                  const after = uw ? uw.net[k] : 0;
                  const worse = uw && k !== f && after < Math.min(0, net[k]) - 0.5;
                  return (
                    <tr key={k} className="border-t border-line">
                      <td className="py-1" style={{ color: COLORS[k] }}>
                        {NAME(k)}
                      </td>
                      <td className="py-1 text-right text-ink">{brl(v)}</td>
                      <td className={`py-1 text-right ${net[k] < 0 ? "text-bad" : "text-ok"}`}>{brl(net[k])}</td>
                      {uw && (
                        <td className={`py-1 text-right ${k === f ? "text-faint" : worse ? "text-bad" : "text-muted"}`}>{k === f ? "defaults" : brl(after)}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-faint">DNS: a PSP fails before the end-of-cycle settlement</div>
              <Segmented
                value={failed}
                onChange={setFailed}
                options={[{ value: "none", label: "none" }, ...need.map((_, k) => ({ value: String(k), label: String.fromCharCode(65 + k) }))]}
              />
            </div>
            {uw && (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Under netting, {NAME(f)}&apos;s payments were never final. Unwinding them changes everyone else&apos;s position; red cells are
                PSPs that now owe more than they planned for — a liquidity shock that can cascade. Under RTGS each of those Pix was already
                final at t4; nothing unwinds.
              </p>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: set the timing mismatch to 0 — with perfectly interleaved flows netting saves little (only the random walk of the day is netted). Push it up (some PSPs pay out in the morning and get paid at night, like payroll vs. retail) and gross settlement needs several times more, while the end-of-day net barely moves. Now drag the opening balance
        to 60% and count the AM04s. Raise concentration (one big PSP receives most flows) and see the small PSPs&apos; RTGS need jump. Finally
        default a PSP under DNS and look for red in the last column.
      </p>
    </div>
  );
}
