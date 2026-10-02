"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { rng } from "@/lib/random";
import { ISPB, resourceId } from "./model";

type M = { rid: string; e2e: string; amount: number };
type Log = { s: string; tone: "ok" | "bad" | "warn" | "muted" | "info" };
type Dedupe = "none" | "rid" | "e2e";

const B = 3;
const SRC = rng(42);
const MSGS: M[] = Array.from({ length: 15 }, (_, i) => ({
  rid: resourceId(SRC),
  e2e: `E87654321202610021530${String(i).padStart(2, "0")}${"QwErTyUiOpA".slice(0, 9)}`,
  amount: 50 + ((i * 37) % 400),
}));
const h32 = (a: number, b: number) => ((Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503)) >>> 0).toString(16).padStart(8, "0");
const tok = (pos: number, gen: number) => `/api/v1/out/${ISPB}/stream/${(h32(pos, gen) + h32(gen, pos)).slice(0, 12)}`;

type State = {
  ack: number; // server: everything before this index is acknowledged
  stream: { token: string; pos: number; prevToken?: string; prevPos?: number } | null;
  gen: number;
  credited: Record<string, number>;
  seenRid: string[];
  seenE2e: string[];
  log: Log[];
  dupTick: number;
};

const init = (): State => ({ ack: 0, stream: null, gen: 1, credited: {}, seenRid: [], seenE2e: [], log: [], dupTick: 0 });

export function Delivery() {
  const [st, setSt] = useState<State>(init);
  const [dedupe, setDedupe] = useState<Dedupe>("none");
  const [serverDup, setServerDup] = useState<"off" | "on">("off");

  const deliver = (s: State, from: number, crash: boolean, label: string): State => {
    let batch = MSGS.slice(from, from + B);
    let dupTick = s.dupTick;
    if (serverDup === "on" && from > 0 && batch.length) {
      dupTick++;
      if (dupTick % 2 === 1) batch = [MSGS[from - 1], ...batch]; // the API occasionally redelivers, same ResourceId
    }
    const gen = s.gen + 1;
    const pos = from + Math.min(B, MSGS.length - from);
    const token = tok(pos, gen);
    const logs: Log[] = [{ s: `${label} → ${batch.length ? `200 OK · ${batch.length} part(s)` : "204 No Content (after the long-poll wait)"} · PI-Pull-Next: …${token.slice(-12)}`, tone: "info" }];
    const credited = { ...s.credited };
    const seenRid = [...s.seenRid];
    const seenE2e = [...s.seenE2e];
    if (crash) logs.push({ s: `✕ reader crashed before storing ${batch.length} message(s); token lost`, tone: "bad" });
    else
      for (const m of batch) {
        if (dedupe === "rid" && seenRid.includes(m.rid)) logs.push({ s: `   ${m.rid.slice(0, 10)}… duplicate ResourceId, dropped`, tone: "warn" });
        else if (dedupe === "e2e" && seenE2e.includes(m.e2e)) logs.push({ s: `   ${m.e2e.slice(-12)} EndToEndId already processed, dropped`, tone: "warn" });
        else {
          credited[m.e2e] = (credited[m.e2e] ?? 0) + 1;
          const twice = credited[m.e2e] > 1;
          logs.push({ s: `   stored + credited R$ ${m.amount} · rid ${m.rid.slice(0, 10)}… · e2e …${m.e2e.slice(-12)}${twice ? "  ← CREDITED TWICE" : ""}`, tone: twice ? "bad" : "ok" });
        }
        seenRid.push(m.rid);
        seenE2e.push(m.e2e);
      }
    return {
      ...s,
      gen,
      dupTick,
      credited,
      seenRid,
      seenE2e,
      stream: crash ? null : { token, pos, prevToken: s.stream?.token, prevPos: s.stream?.pos },
      log: [...logs.reverse(), ...s.log].slice(0, 60),
    };
  };

  const act = (f: (s: State) => State) => setSt((s) => f(s));
  const start = () => act((s) => deliver({ ...s }, s.ack, false, "GET …/stream/start"));
  const next = (crash = false) =>
    act((s) => {
      if (!s.stream) return { ...s, log: [{ s: "No open stream: call stream/start first.", tone: "muted" }, ...s.log] };
      const ack = Math.max(s.ack, s.stream.pos); // following the latest PI-Pull-Next acknowledges the previous batch
      return deliver({ ...s, ack }, s.stream.pos, crash, `GET …${s.stream.token.slice(-12)}`);
    });
  const stale = () =>
    act((s) => {
      if (!s.stream?.prevToken || s.stream.prevPos === undefined) return { ...s, log: [{ s: "Need at least two reads to have a stale token.", tone: "muted" }, ...s.log] };
      return deliver({ ...s }, s.stream.prevPos, false, `GET …${s.stream.prevToken.slice(-12)} (STALE token)`);
    });
  const del = () =>
    act((s) => {
      if (!s.stream) return s;
      return { ...s, ack: Math.max(s.ack, s.stream.pos), stream: null, log: [{ s: `DELETE …${s.stream.token.slice(-12)} → 200 OK · last batch marked as read`, tone: "ok" }, ...s.log] };
    });
  const quit = () => act((s) => ({ ...s, stream: null, log: [{ s: "process stopped WITHOUT DELETE: the last batch is still unacknowledged at the ICOM", tone: "warn" }, ...s.log] }));

  const twice = Object.values(st.credited).filter((c) => c > 1).length;
  const unique = Object.keys(st.credited).length;

  // sender side: SPI idempotency on EndToEndId
  const [sends, setSends] = useState<{ rid: string; amount: number; e2e: string; result: string; tone: Log["tone"] }[]>([]);
  const send = (kind: "first" | "same" | "diff" | "new") => {
    const r = rng(sends.length + 11);
    const e2e = kind === "new" || !sends.length ? `E${ISPB}202610021530${"Ab3Cd5Ef7Gh".slice(0, 9)}${String(sends.length).padStart(2, "0")}` : sends[sends.length - 1].e2e;
    const prev = sends.filter((x) => x.e2e === e2e);
    const amount = kind === "diff" ? 200 : prev.length ? prev[0].amount : 100;
    let result: string;
    let tone: Log["tone"];
    if (!prev.length) {
      result = "new operation → processed → pacs.002 ACSC (settled), Conta PI debited once";
      tone = "ok";
    } else if (prev[0].amount === amount) {
      result = "same EndToEndId, identical content → SPI replays the previous pacs.002. No second debit.";
      tone = "info";
    } else {
      result = "same EndToEndId, different content → rejected as an idempotency conflict. Never reuse an id.";
      tone = "bad";
    }
    setSends((x) => [...x, { rid: resourceId(r), amount, e2e, result, tone }]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
        <div className="space-y-3">
          <Controls>
            <Button variant="primary" onClick={start}>
              GET stream/start
            </Button>
            <Button onClick={() => next(false)} disabled={!st.stream}>
              GET PI-Pull-Next
            </Button>
            <Button onClick={() => next(true)} disabled={!st.stream}>
              GET, then crash
            </Button>
            <Button onClick={stale} disabled={!st.stream}>
              GET stale token
            </Button>
            <Button onClick={del} disabled={!st.stream}>
              DELETE
            </Button>
            <Button onClick={quit} disabled={!st.stream}>
              Quit without DELETE
            </Button>
            <Button variant="ghost" onClick={() => setSt(init())}>
              Reset
            </Button>
          </Controls>
          <Controls>
            <span className="inline-flex items-center gap-2 text-muted">
              your dedupe
              <Segmented value={dedupe} onChange={setDedupe} options={[{ value: "none", label: "none" }, { value: "rid", label: "by PI-ResourceId" }, { value: "e2e", label: "by EndToEndId" }]} />
            </span>
            <span className="inline-flex items-center gap-2 text-muted">
              ICOM occasional redelivery
              <Segmented value={serverDup} onChange={setServerDup} options={[{ value: "off", label: "off" }, { value: "on", label: "on" }]} />
            </span>
          </Controls>
          <Panel title="Reader log (newest first) · multipart, 3 per response" bodyClassName="max-h-72 overflow-auto font-mono text-[11.5px] leading-relaxed">
            {!st.log.length && <div className="text-faint">Start a stream.</div>}
            {st.log.map((l, i) => (
              <div key={i} className={clsx("whitespace-pre-wrap", { ok: "text-ok", bad: "text-bad", warn: "text-warn", muted: "text-faint", info: "text-muted" }[l.tone])}>
                {l.s}
              </div>
            ))}
          </Panel>
        </div>
        <div className="grid content-start gap-2">
          <Stat label="acknowledged at ICOM" value={`${st.ack} / ${MSGS.length}`} hint="advanced by the next GET or by DELETE" />
          <Stat label="payments credited" value={unique} />
          <Stat label="credited twice" value={twice} tone={twice ? "bad" : "good"} hint={twice ? "your customers got paid twice" : "so far so good"} />
          <Stat label="stream" value={st.stream ? "open" : "none"} hint={st.stream ? `next: …${st.stream.token.slice(-12)}` : ""} />
        </div>
      </div>
      <Panel title="Sending side: PI-ResourceId is per delivery, idempotency is per operation">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => send("first")}>
            POST pacs.008 (R$ 100)
          </Button>
          <Button onClick={() => send("same")} disabled={!sends.length}>
            Resend identical (after 5xx/timeout)
          </Button>
          <Button onClick={() => send("diff")} disabled={!sends.length}>
            Resend same EndToEndId, R$ 200
          </Button>
          <Button onClick={() => send("new")}>New EndToEndId</Button>
          <Button variant="ghost" onClick={() => setSends([])}>
            Reset
          </Button>
        </div>
        <div className="mt-3 space-y-1 font-mono text-[11.5px]">
          {sends.map((x, i) => (
            <div key={i} className={{ ok: "text-ok", bad: "text-bad", warn: "text-warn", muted: "text-faint", info: "text-info" }[x.tone]}>
              201 · PI-ResourceId {x.rid.slice(0, 12)}… · e2e …{x.e2e.slice(-11)} · R$ {x.amount} → {x.result}
            </div>
          ))}
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: start, read twice, then “Quit without DELETE” and start again. The last batch comes back with the same ResourceIds. With dedupe “none” the customer is
        credited twice; switch to “by PI-ResourceId” and repeat. Then try “GET, then crash” followed by stream/start: nothing is lost, because the crashed batch was never
        acknowledged.
      </p>
    </div>
  );
}
