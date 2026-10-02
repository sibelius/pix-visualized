"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { rng } from "@/lib/random";
import {
  E2E_SEGMENTS,
  MSGID_SEGMENTS,
  checkChars,
  e2eInstant,
  fnv1a,
  makeE2E,
  makeMsgId,
  validateE2E,
  validateMsgId,
  type Issue,
  type Segment,
} from "./ids";

const BASE = Date.UTC(2026, 9, 2, 14, 3); // 2026-10-02T14:03Z, fixed so SSR and CSR agree

function Strip({ value, segs }: { value: string; segs: Segment[] }) {
  const chars = checkChars(value, segs);
  const total = segs.reduce((a, s) => a + s.len, 0);
  const missing = Math.max(0, total - value.length);
  let offset = 0;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-y-3">
        {segs.map((s) => {
          const start = offset;
          offset += s.len;
          const cs = chars.slice(start, start + s.len);
          return (
            <div key={s.id} className="mr-1 flex flex-col items-center" title={s.hint}>
              <div className="flex">
                {cs.map((c, i) => (
                  <span
                    key={i}
                    className={clsx(
                      "flex h-7 w-[15px] items-center justify-center font-mono text-[12px] sm:w-[17px]",
                      c.ok ? "text-ink" : "bg-bad/25 text-bad",
                    )}
                    style={{ borderBottom: `2px solid ${c.ok ? s.color : "#f87171"}` }}
                  >
                    {c.ch}
                  </span>
                ))}
                {Array.from({ length: s.len - cs.length }, (_, i) => (
                  <span key={`m${i}`} className="flex h-7 w-[15px] items-center justify-center border-b-2 border-dashed border-faint font-mono text-[12px] text-faint sm:w-[17px]">
                    ·
                  </span>
                ))}
              </div>
              <span className="mt-1 font-mono text-[10px]" style={{ color: s.color }}>
                {s.label}·{s.len}
              </span>
            </div>
          );
        })}
        {chars.slice(total).length > 0 && (
          <div className="flex flex-col items-center">
            <div className="flex">
              {chars.slice(total).map((c, i) => (
                <span key={i} className="flex h-7 w-[15px] items-center justify-center bg-bad/25 font-mono text-[12px] text-bad sm:w-[17px]">
                  {c.ch}
                </span>
              ))}
            </div>
            <span className="mt-1 font-mono text-[10px] text-bad">extra</span>
          </div>
        )}
      </div>
      {missing > 0 && <div className="mt-1 text-[11px] text-warn">{missing} characters missing</div>}
    </div>
  );
}

function Issues({ items }: { items: Issue[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {items.map((i, k) => (
        <li key={k} className={clsx("flex gap-2", i.level === "ok" ? "text-ok" : i.level === "warn" ? "text-warn" : "text-bad")}>
          <span>{i.level === "ok" ? "✓" : i.level === "warn" ? "!" : "✗"}</span>
          <span className="text-muted">{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

const PRESETS: { label: string; e2e: string }[] = [
  { label: "valid", e2e: "E12345678202610021403k7Qm2Xr9TbA" },
  { label: "catalog example (day 34)", e2e: "E9999901012341234123412345678900" },
  { label: "month 13", e2e: "E12345678202613021403k7Qm2Xr9TbA" },
  { label: "lowercase ISPB", e2e: "E1234567a202610021403k7Qm2Xr9TbA" },
  { label: "Brasília time, not UTC", e2e: "E12345678202610021103k7Qm2Xr9TbA" },
  { label: "a symbol", e2e: "E12345678202610021403k7Qm2Xr9Tb-" },
];

export function IdBuilder() {
  const [e2e, setE2e] = useState(PRESETS[0].e2e);
  const [msgId, setMsgId] = useState("M12345678Q1w2E3r4T5y6U7i8O9p0As1");
  const [skewH, setSkewH] = useState(0.05);
  const gen = useRef(rng(2026));
  const spiNow = new Date(BASE + skewH * 3_600_000);

  const e2eIssues = validateE2E(e2e, spiNow);
  const msgIssues = validateMsgId(msgId);
  const at = e2eInstant(e2e);
  const ispb = /^[ED]([0-9A-Z]{8})/.exec(e2e)?.[1] ?? "????????";
  const brt = at ? new Date(at.getTime() - 3 * 3_600_000) : null;

  const regenerate = () => {
    const g = gen.current;
    setE2e(makeE2E("12345678", new Date(BASE), g.next));
    setMsgId(makeMsgId("12345678", g.next));
  };

  const chain = [
    { msg: "pacs.008", dir: "payer PSP → SPI", from: ispb },
    { msg: "pacs.008", dir: "SPI → receiver PSP", from: "00038166" },
    { msg: "pacs.002 ACSP", dir: "receiver PSP → SPI", from: "87654321" },
    { msg: "pacs.002 ACCC", dir: "SPI → receiver PSP", from: "00038166" },
    { msg: "pacs.002 ACSC", dir: "SPI → payer PSP", from: "00038166" },
    { msg: "camt.054 (if requested)", dir: "SPI → PSP", from: "00038166" },
    { msg: "pacs.004 (devolução; own RtrId D…)", dir: "receiver PSP → SPI", from: "87654321" },
  ];
  const cg = rng(7);

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={regenerate}>
          Generate new pair
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.slice(1).map((p) => (
            <Button key={p.label} variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setE2e(p.e2e)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Slider
          label="SPI clock"
          value={skewH}
          min={-16}
          max={16}
          step={0.05}
          onChange={setSkewH}
          format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} h`}
          className="min-w-72 flex-1"
        />
      </Controls>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="EndToEndId · idFimAFim">
          <input
            value={e2e}
            spellCheck={false}
            onChange={(ev) => setE2e(ev.target.value.slice(0, 40))}
            className="mb-3 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-xs"
          />
          <Strip value={e2e} segs={E2E_SEGMENTS} />
          <div className="mt-3">
            <Issues items={e2eIssues} />
          </div>
          {at && brt && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="embedded minute (UTC)" value={<span className="text-sm">{at.toISOString().slice(0, 16)}Z</span>} />
              <Stat label="same in Brasília" value={<span className="text-sm">{brt.toISOString().slice(0, 16).replace("T", " ")}</span>} hint="UTC−3" />
            </div>
          )}
        </Panel>
        <Panel title="MsgId · idMensagem (and BizMsgIdr)">
          <input
            value={msgId}
            spellCheck={false}
            onChange={(ev) => setMsgId(ev.target.value.slice(0, 40))}
            className="mb-3 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-xs"
          />
          <Strip value={msgId} segs={MSGID_SEGMENTS} />
          <div className="mt-3">
            <Issues items={msgIssues} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The MsgId has no timestamp and no meaning beyond &quot;this envelope&quot;. Every hop mints a new one with the sender&apos;s own ISPB,
            so the same payment travels under five or more different MsgIds.
          </p>
        </Panel>
      </div>

      <Panel title="One payment, many messages: what changes and what does not">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left font-mono text-[11px]">
            <thead className="text-faint">
              <tr>
                <th className="py-1 pr-3 font-normal">message</th>
                <th className="py-1 pr-3 font-normal">direction</th>
                <th className="py-1 pr-3 font-normal">GrpHdr/MsgId (new each hop)</th>
                <th className="py-1 font-normal">EndToEndId / OrgnlEndToEndId</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((c, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-3 text-ink">{c.msg}</td>
                  <td className="py-1 pr-3 text-muted">{c.dir}</td>
                  <td className="py-1 pr-3">
                    <span className="text-[#818cf8]">M</span>
                    <span className="text-accent">{c.from}</span>
                    <span className="text-warn">{makeMsgId("", cg.next).slice(1)}</span>
                  </td>
                  <td className="py-1 text-ink">{e2e.slice(0, 32)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: load &quot;catalog example (day 34)&quot; — the BCB&apos;s own sample passes the XSD regex, because the pattern only checks digit
        ranges, yet it is not a real date. Then drag the SPI clock past ±12 h, or load &quot;Brasília time&quot;: a PSP that stamps local
        time instead of UTC is three hours off — inside the tolerance, so nothing rejects it, but every id it mints now records the wrong minute.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

type LogLine = { t: number; who: "PSP" | "SPI"; text: string; tone?: "ok" | "bad" | "warn" };

export function IdempotencyDemo() {
  const [keyBy, setKeyBy] = useState<"e2e" | "msgid">("e2e");
  const [balance, setBalance] = useState(10_000);
  const [log, setLog] = useState<LogLine[]>([]);
  const [debits, setDebits] = useState(0);
  const [payments, setPayments] = useState(0);
  const store = useRef(new Map<string, { hash: string; reply: string }>());
  const g = useRef(rng(99));
  const cur = useRef<{ e2e: string; amount: string } | null>(null);
  const clock = useRef(0);

  const reset = (k = keyBy) => {
    setKeyBy(k);
    setBalance(10_000);
    setLog([]);
    setDebits(0);
    setPayments(0);
    store.current = new Map();
    g.current = rng(99);
    cur.current = null;
    clock.current = 0;
  };

  const send = (amount: string, e2e: string, note: string) => {
    const msgId = makeMsgId("12345678", g.current.next); // a fresh MsgId per transmission, as the catalog requires
    const payload = `${e2e}|${amount}|12345678|87654321`;
    const hash = fnv1a(payload);
    const key = keyBy === "e2e" ? e2e : msgId;
    clock.current += 1;
    const t = clock.current;
    const lines: LogLine[] = [{ t, who: "PSP", text: `${note}: pacs.008 MsgId=${msgId.slice(0, 13)}… E2E=${e2e.slice(0, 13)}… R$ ${amount}` }];
    const prev = store.current.get(key);
    if (prev && prev.hash === hash) {
      lines.push({ t, who: "SPI", text: `key seen, identical content → replays stored answer: ${prev.reply} (no new debit)`, tone: "ok" });
    } else if (prev) {
      lines.push({ t, who: "SPI", text: `key seen, DIFFERENT content → error, nothing settles`, tone: "bad" });
    } else {
      const reply = `pacs.002 ACSC ${e2e.slice(0, 13)}…`;
      store.current.set(key, { hash, reply });
      setBalance((b) => b - Number(amount));
      setDebits((d) => d + 1);
      lines.push({ t, who: "SPI", text: `new key → settles, debits Conta PI R$ ${amount}, replies ${reply}`, tone: note !== "new payment" ? "bad" : "ok" });
    }
    setLog((l) => [...lines.reverse(), ...l].slice(0, 14));
  };

  const fresh = () => {
    const e2e = makeE2E("12345678", new Date(BASE), g.current.next);
    cur.current = { e2e, amount: "150.00" };
    setPayments((p) => p + 1);
    send("150.00", e2e, "new payment");
  };
  const retry = () => cur.current && send(cur.current.amount, cur.current.e2e, "timeout, retry");
  const tamper = () => cur.current && send("1500.00", cur.current.e2e, "retry with changed amount");

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={keyBy}
          onChange={(v) => reset(v)}
          options={[
            { value: "e2e", label: "SPI dedups by EndToEndId (real)" },
            { value: "msgid", label: "naive: dedup by MsgId" },
          ]}
        />
        <Button variant="primary" onClick={fresh}>
          New Pix R$ 150
        </Button>
        <Button onClick={retry} disabled={!cur.current}>
          Response lost → resend
        </Button>
        <Button onClick={tamper} disabled={!cur.current}>
          Resend, amount changed
        </Button>
        <Button variant="ghost" onClick={() => reset()}>
          Reset
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Panel title="Wire log (newest first)">
          <ul className="min-h-40 space-y-1 font-mono text-[11px]">
            {log.length === 0 && <li className="text-faint">Send a Pix, then pretend the pacs.002 never arrived and resend it.</li>}
            {log.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-6 shrink-0 text-faint">{l.t}</span>
                <span className={clsx("w-8 shrink-0", l.who === "SPI" ? "text-[#818cf8]" : "text-accent")}>{l.who}</span>
                <span className={clsx("min-w-0 break-words", l.tone === "bad" ? "text-bad" : l.tone === "warn" ? "text-warn" : l.tone === "ok" ? "text-ink" : "text-muted")}>
                  {l.text}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          <Stat label="payer Conta PI" value={`R$ ${balance.toLocaleString("en-US")}`} tone={debits > payments ? "bad" : "neutral"} hint={`${payments} distinct payment${payments === 1 ? "" : "s"}`} />
          <Stat label="debits settled" value={debits} tone={debits > payments ? "bad" : "neutral"} hint={keyBy === "e2e" ? "one per distinct E2E" : "one per transmission!"} />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: send one Pix and hit &quot;resend&quot; three times — balance moves once. Switch to the naive mode and repeat: because each
        transmission must carry a new MsgId, a MsgId-keyed system pays the same Pix four times. The catalog sets the key per message type
        (pacs.008 → EndToEndId, pacs.002 → OrgnlEndToEndId, pacs.004 → RtrId) and a 24 h window for transfers and returns.
      </p>
    </div>
  );
}
