"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Slider, Stat } from "@/components/ui";
import { Check } from "./Field";
import { addMs, brl, e2eId, PAYEE_PSP, PAYER_PSP } from "./xml";

const BASE = "2026-10-02T14:00:00.000Z";
const H = 3600_000;
const WINDOW_H = 24;
const TOLERANCE_H = 12;

type Entry = { e2e: string; amount: number; hash: string; at: number; answer: string };
type Log = { t: number; text: string; tone?: "ok" | "bad" | "warn" | "info" };

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Canonical content of the operation: what the SPI compares when it sees a known EndToEndId. */
const canonical = (e2e: string, amount: number) =>
  `pacs.008|${e2e}|${amount.toFixed(2)}|BRL|Dbtr=39053344705|DbtrAgt=${PAYER_PSP.ispb}|CdtrAgt=${PAYEE_PSP.ispb}|Cdtr=12345678909|CdtrAcct=0001/48213307`;

export function Idempotency() {
  const [now, setNow] = useState(0); // ms since BASE
  const [amount, setAmount] = useState(80);
  const [lose, setLose] = useState(true);
  const [store, setStore] = useState<Entry[]>([]);
  const [psp, setPsp] = useState<{ e2e: string; amount: number; known: "settled" | "unknown" | "error" }[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [debits, setDebits] = useState(0);
  const [seq, setSeq] = useState(1);
  const [busy, setBusy] = useState(false);

  const push = (l: Log) => setLog((x) => [l, ...x].slice(0, 14));
  const last = psp[psp.length - 1];

  async function submit(e2e: string, amt: number, isNew: boolean) {
    setBusy(true);
    const hash = await sha256hex(canonical(e2e, amt));
    const prev = store.find((s) => s.e2e === e2e);
    const embedded = Date.parse(BASE) + (isNew ? now : (prev?.at ?? now)); // timestamp inside the e2e
    const skewH = (Date.parse(BASE) + now - embedded) / H;
    if (prev && now - prev.at <= WINDOW_H * H) {
      if (prev.hash === hash) {
        push({ t: now, text: `${e2e.slice(0, 13)}… seen ${fmtH(now - prev.at)} ago, same digest ${hash.slice(0, 10)}… → replay "${prev.answer}". No second debit.`, tone: "ok" });
        setPsp((p) => p.map((x) => (x.e2e === e2e ? { ...x, known: "settled" } : x)));
      } else {
        push({ t: now, text: `${e2e.slice(0, 13)}… seen, but digest ${hash.slice(0, 10)}… ≠ ${prev.hash.slice(0, 10)}… → error: same key, different operation.`, tone: "bad" });
        setPsp((p) => [...p.filter((x) => !(x.e2e === e2e && x.amount === amt)), { e2e, amount: amt, known: "error" }]);
      }
      setBusy(false);
      return;
    }
    if (Math.abs(skewH) > TOLERANCE_H) {
      push({ t: now, text: `${e2e.slice(0, 13)}… outside the idempotency window, and its embedded time is ${skewH.toFixed(1)} h old (> ±${TOLERANCE_H} h) → rejected as an invalid EndToEndId.`, tone: "bad" });
      setBusy(false);
      return;
    }
    const answer = "pacs.002 ACSC";
    setStore((s) => [...s.filter((x) => x.e2e !== e2e), { e2e, amount: amt, hash, at: now, answer }]);
    setDebits((d) => d + amt);
    push({ t: now, text: `${e2e.slice(0, 13)}… new: reserve, forward, ACSP, settle ${brl(amt)}. Digest ${hash.slice(0, 10)}… stored.`, tone: "info" });
    if (lose && isNew) {
      push({ t: now, text: "…the HTTP response / pacs.002 never reached the payer PSP. Did it settle?", tone: "warn" });
      setPsp((p) => [...p, { e2e, amount: amt, known: "unknown" }]);
    } else {
      setPsp((p) => (isNew ? [...p, { e2e, amount: amt, known: "settled" }] : p.map((x) => (x.e2e === e2e ? { ...x, known: "settled" } : x))));
    }
    setBusy(false);
  }

  const sendNew = () => {
    const e2e = e2eId(PAYER_PSP.ispb, addMs(BASE, now), seq * 31);
    setSeq((s) => s + 1);
    void submit(e2e, amount, true);
  };
  const reset = () => {
    setNow(0);
    setStore([]);
    setPsp([]);
    setLog([]);
    setDebits(0);
    setSeq(1);
  };

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={sendNew} disabled={busy}>
          Send new pacs.008
        </Button>
        <Button onClick={() => last && submit(last.e2e, last.amount, false)} disabled={!last || busy}>
          Resend last (identical)
        </Button>
        <Button onClick={() => last && submit(last.e2e, last.amount + 1, false)} disabled={!last || busy}>
          Resend last, amount + R$ 1
        </Button>
        <Button onClick={() => setNow((t) => t + 6 * H)}>Clock +6 h</Button>
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
        <Slider label="amount" value={amount} min={10} max={500} step={10} onChange={setAmount} format={brl} className="min-w-52" />
        <Check label="lose the response" checked={lose} onChange={setLose} />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
        <Panel title="SPI idempotency store (key = EndToEndId)" bodyClassName="p-0">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10.5px] tracking-wide text-faint uppercase">
              <tr className="border-b border-line">
                <th className="px-3 py-2">EndToEndId</th>
                <th className="px-2 py-2">digest</th>
                <th className="px-2 py-2">age</th>
              </tr>
            </thead>
            <tbody>
              {store.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-faint">
                    empty
                  </td>
                </tr>
              )}
              {store.map((s) => {
                const age = now - s.at;
                const expired = age > WINDOW_H * H;
                return (
                  <tr key={s.e2e} className={clsx("border-b border-line/60 font-mono", expired && "opacity-40")}>
                    <td className="px-3 py-1.5 break-all">
                      {s.e2e.slice(0, 9)}
                      <span className="text-ok">{s.e2e.slice(9, 21)}</span>
                      {s.e2e.slice(21)}
                    </td>
                    <td className="px-2 py-1.5 text-muted">{s.hash.slice(0, 8)}</td>
                    <td className={clsx("px-2 py-1.5", expired ? "text-faint" : "text-muted")}>{expired ? "expired" : fmtH(age)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Payer PSP's view" bodyClassName="space-y-1.5 text-[12px]">
          {psp.length === 0 && <p className="text-faint">No orders yet.</p>}
          {psp.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-2 font-mono">
              <span className="truncate">{p.e2e.slice(0, 13)}…</span>
              <span>{brl(p.amount)}</span>
              <span className={clsx(p.known === "settled" ? "text-ok" : p.known === "unknown" ? "text-warn" : "text-bad")}>{p.known === "unknown" ? "unknown?" : p.known}</span>
            </div>
          ))}
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
          <Stat label="clock" value={`+${fmtH(now)}`} hint={`window ${WINDOW_H} h · e2e ±${TOLERANCE_H} h`} />
          <Stat label="payer Conta PI debited" value={brl(debits)} hint={`${store.length} distinct operations`} />
        </div>
      </div>
      <Panel title="Log">
        <ol className="space-y-1 font-mono text-[11.5px] leading-snug">
          {log.length === 0 && <li className="text-faint">Send a payment with &quot;lose the response&quot; on, then resend it.</li>}
          {log.map((l, i) => (
            <li key={i} className={clsx(l.tone === "ok" && "text-ok", l.tone === "bad" && "text-bad", l.tone === "warn" && "text-warn", l.tone === "info" && "text-info")}>
              <span className="text-faint">+{fmtH(l.t)}</span> {l.text}
            </li>
          ))}
        </ol>
      </Panel>
      <p className="text-xs text-faint">
        Try: send with the response lost. The payer PSP does not know if the money moved. Resend the identical message as many times as you like: the SPI hashes the operation,
        finds the same EndToEndId with the same content and replays the answer, and the Conta PI debit stays at one. Change the amount and resend: same key, different content,
        error. Advance the clock by 30 h and resend: the window is over, but the EndToEndId&apos;s embedded minute is now far outside the ±12 h tolerance, so it cannot be
        processed again either.
      </p>
    </div>
  );
}

function fmtH(ms: number) {
  const h = ms / H;
  return h < 1 ? `${Math.round(ms / 60000)} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`;
}
