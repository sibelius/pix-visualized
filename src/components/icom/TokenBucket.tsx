"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { fmt } from "@/lib/random";
import { BUCKETS, MANUAL_EXPECTED, MANUAL_TABLE, replayBucket, tokenCost, type BucketId, type MsgType } from "./model";

const W = 720;
const H = 230;
const PAD = { l: 50, r: 10, t: 12, b: 26 };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function TokenBucket() {
  const [bucket, setBucket] = useState<BucketId>("primary");
  const [type, setType] = useState<MsgType>("pacs.008");
  const [ops, setOps] = useState(1);
  const [msgs, setMsgs] = useState(1);
  const [rps, setRps] = useState(400);
  const [burst, setBurst] = useState(1500);
  const [burstLen, setBurstLen] = useState(4);
  const b = BUCKETS.find((x) => x.id === bucket)!;
  const secondary = bucket.startsWith("sec");
  const maxOps = secondary ? 500 : 10;
  const opsC = Math.min(ops, maxOps);

  const seconds = 60;
  const offered = useMemo(
    () => Array.from({ length: seconds }, (_, s) => tokenCost(type, opsC, msgs) * (s >= 10 && s < 10 + burstLen ? burst : rps)),
    [type, opsC, msgs, rps, burst, burstLen],
  );
  const rows = useMemo(() => replayBucket(b.max, b.refill, offered), [b.max, b.refill, offered]);
  // check every row of the manual's table against the rule, starting from the manual's own previous balance
  const manual = MANUAL_TABLE.map((offered, i) => {
    const prev = i ? MANUAL_EXPECTED[i - 1] : 2500;
    const rejected = prev <= 0;
    const debit = rejected ? 0 : offered;
    return { s: i + 1, offered, rejected, debit, credit: 500, bal: Math.min(2500, prev - debit + 500) };
  });

  const minB = Math.min(0, ...rows.map((r) => r.bal));
  const maxB = Math.max(b.max, ...offered) * 1.05;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const X = (s: number) => r1(PAD.l + (s / seconds) * iw);
  const Y = (v: number) => r1(PAD.t + ih - ((v - minB) / (maxB - minB || 1)) * ih);
  const rejectedSecs = rows.filter((r) => r.rejected).length;
  const rejectedTok = rows.reduce((a, r) => a + (r.rejected ? r.offered : 0), 0);
  const maxRetry = Math.max(0, ...rows.map((r) => r.retryAfter));

  // the manual's overnight example
  const [nOps, setNOps] = useState(1_000_000);
  const [hours, setHours] = useState(8);
  const perReq = 10 * 500;
  const reqs = Math.ceil(nOps / perReq);
  const interval = (hours * 3600) / reqs;

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex flex-wrap items-center gap-2 text-muted">
          bucket
          <Segmented value={bucket} onChange={setBucket} options={BUCKETS.map((x) => ({ value: x.id, label: x.label }))} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          message
          <Segmented value={type} onChange={setType} options={[{ value: "pacs.008", label: "pacs.008 (1/op)" }, { value: "pacs.002", label: "pacs.002 (0.2/op)" }, { value: "other", label: "other (1/msg)" }]} />
        </span>
      </Controls>
      <Controls>
        <Slider label="ops per message" value={opsC} min={1} max={maxOps} step={1} onChange={setOps} format={(v) => `${v}${secondary ? " (≤500)" : " (≤10)"}`} className="min-w-56 flex-1" />
        <Slider label="messages per request" value={msgs} min={1} max={10} step={1} onChange={setMsgs} className="min-w-52 flex-1" />
        <Slider label="steady requests/s" value={rps} min={0} max={secondary ? 50 : 1500} step={1} onChange={setRps} className="min-w-56 flex-1" />
        <Slider label="burst at t=10 s" value={burst} min={0} max={secondary ? 200 : 4000} step={10} onChange={setBurst} format={(v) => `${v} req/s`} className="min-w-56 flex-1" />
        <Slider label="burst length" value={burstLen} min={1} max={20} step={1} onChange={setBurstLen} format={(v) => `${v} s`} className="min-w-48 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <Panel title={`Token balance per second · bucket ${fmt(b.max)} · +${fmt(b.refill)}/s`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
            {rows.map((r) => (
              <rect key={r.s} x={X(r.s - 1) + 1} y={Y(Math.min(maxB, r.offered))} width={r1(iw / seconds - 2)} height={Math.max(0, r1(Y(0) - Y(Math.min(maxB, r.offered))))} fill={r.rejected ? "#f87171" : "#5a6275"} opacity={0.45} />
            ))}
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(0)} y2={Y(0)} stroke="#8a93a8" />
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(b.max)} y2={Y(b.max)} stroke="#242a38" strokeDasharray="4 3" />
            <text x={PAD.l + 4} y={Y(b.max) - 3} fontSize={10} fill="#5a6275">
              bucket max {fmt(b.max)}
            </text>
            <path d={rows.map((r, i) => `${i ? "L" : "M"}${X(r.s)},${Y(r.bal)}`).join("")} fill="none" stroke="#f472b6" strokeWidth={2} />
            {[0, 10, 20, 30, 40, 50, 60].map((s) => (
              <text key={s} x={X(s)} y={H - 8} fontSize={10} textAnchor="middle" fill="#5a6275">
                {s}s
              </text>
            ))}
            {[minB, 0, b.max].map((v, i) => (
              <text key={i} x={PAD.l - 6} y={Y(v) + 3.5} fontSize={10} textAnchor="end" fill="#5a6275">
                {fmt(v)}
              </text>
            ))}
          </svg>
          <div className="mt-1 text-xs text-muted">
            pink: token balance at the end of each second · bars: tokens offered (grey accepted, red refused with 429)
          </div>
        </Panel>
        <div className="grid content-start gap-2">
          <Stat label="cost per request" value={`${fmt(tokenCost(type, opsC, msgs), 1)} tok`} hint={`${msgs} msg × ${opsC} op`} />
          <Stat label="seconds answered 429" value={rejectedSecs} tone={rejectedSecs ? "bad" : "good"} hint={`${fmt(rejectedTok)} tokens' worth refused`} />
          <Stat label="longest Retry-After" value={maxRetry ? `${maxRetry} s` : "—"} tone={maxRetry ? "warn" : "neutral"} />
          <Stat label="lowest balance" value={fmt(Math.min(...rows.map((r) => r.bal)))} tone={Math.min(...rows.map((r) => r.bal)) < 0 ? "bad" : "neutral"} hint="can go negative: debited at processing" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Replay of the manual's example (bucket 2,500, +500/s)" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11.5px]">
              <thead className="border-b border-line text-[10.5px] text-faint uppercase">
                <tr>
                  <th className="px-3 py-1.5">s</th>
                  <th className="px-2 py-1.5">sent</th>
                  <th className="px-2 py-1.5">debit</th>
                  <th className="px-2 py-1.5">credit</th>
                  <th className="px-2 py-1.5">balance</th>
                  <th className="px-2 py-1.5">manual</th>
                </tr>
              </thead>
              <tbody>
                {manual.map((r, i) => (
                  <tr key={r.s} className={clsx("border-b border-line/40", r.rejected && "text-bad", r.bal !== MANUAL_EXPECTED[i] && "bg-warn/10")}>
                    <td className="px-3 py-1">{r.s}</td>
                    <td className="px-2 py-1">{r.rejected ? `429 (${fmt(r.offered)})` : fmt(r.offered)}</td>
                    <td className="px-2 py-1">{fmt(r.debit)}</td>
                    <td className="px-2 py-1">{fmt(r.credit)}</td>
                    <td className="px-2 py-1">{fmt(r.bal)}</td>
                    <td className={clsx("px-2 py-1", r.bal !== MANUAL_EXPECTED[i] ? "text-warn" : "text-faint")}>{fmt(MANUAL_EXPECTED[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-[11.5px] leading-relaxed text-faint">
            Each row is recomputed from the manual&apos;s own previous balance. Rule: a second is refused when the previous second ended at ≤ 0; otherwise everything is
            accepted and debited, even into negative, then the refill is added. Rows 4–6 and 8–9 come out refused, as in the manual. In row 7 the manual prints −500, but
            the rule gives 0 (500 − 1,000 + 500). It looks like a typo in the example. (The “sent” value of refused rows is not given in the manual; 1,000 here.)
          </p>
        </Panel>
        <Panel title="Planning a night batch on the secondary channel">
          <div className="space-y-3">
            <Slider label="operations" value={nOps} min={100_000} max={5_000_000} step={100_000} onChange={setNOps} format={(v) => fmt(v)} />
            <Slider label="window" value={hours} min={1} max={8} step={0.5} onChange={setHours} format={(v) => `${v} h`} />
            <div className="font-mono text-[12px] leading-relaxed text-muted">
              <div>request = 10 msgs × 500 ops = {fmt(perReq)} ops = {fmt(perReq)} tokens</div>
              <div>
                {fmt(nOps)} ops / {fmt(perReq)} = {fmt(reqs)} requests over {hours} h
              </div>
              <div>
                → one request every <span className="text-ink">{fmt(interval, 1)} s</span>
              </div>
              <div>
                needs {fmt(nOps / (hours * 3600), 1)} tok/s vs refill 350/s at night ·{" "}
                <span className={perReq <= 5000 ? "text-ok" : "text-bad"}>a request costs {fmt(perReq)} ≤ bucket 5,000</span>
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-faint">
              The manual&apos;s worked example (1,000,000 ops in 8 h) gives 144 s. Avoid sending a large burst near 08:00, when the secondary bucket drops from 5,000/350
              to 350/35.
            </p>
          </div>
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: on the primary bucket, set a 2,000 req/s burst for 4 seconds. The balance dives below zero and stays refused for several seconds after the burst
        ends. Then switch the message to pacs.002 (0.2 tokens per operation) and the same burst fits.
      </p>
    </div>
  );
}
