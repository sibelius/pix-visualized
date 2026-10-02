"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { STREAM, classify, initialCobs, type InPix, type LCob, type Verdict } from "./reconcile";

type Row = { px: InPix; v: Verdict; via: "webhook" | "sweep" };
const TONE: Record<Verdict["tone"], string> = { ok: "border-ok/40 text-ok", warn: "border-warn/40 text-warn", bad: "border-bad/40 text-bad", info: "border-info/40 text-info" };

export function Reconciliation() {
  const [cobs, setCobs] = useState<LCob[]>(initialCobs);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [hidden, setHidden] = useState<InPix[]>([]);
  const [sweeps, setSweeps] = useState(0);

  const apply = (cs: LCob[], px: InPix): [LCob[], Verdict] => {
    const v = classify(cs, px);
    if (v.kind === "matched" || v.kind === "matched-edited" || v.kind === "matched-cobv" || v.kind === "duplicate")
      return [cs.map((c) => (c.txid === px.txid ? { ...c, status: "CONCLUIDA", paid: [...c.paid, px.e2e] } : c)), v];
    return [cs, v];
  };

  const next = () => {
    const px = STREAM[idx];
    if (!px) return;
    setIdx(idx + 1);
    if (px.via === "sweep-only") {
      setHidden((h) => [...h, px]);
      return;
    }
    const [cs, v] = apply(cobs, px);
    setCobs(cs);
    setRows((r) => [{ px, v, via: "webhook" as const }, ...r]);
  };
  const sweep = () => {
    let cs = cobs;
    const add: Row[] = [];
    for (const px of hidden) {
      const [c2, v] = apply(cs, px);
      cs = c2;
      add.push({ px, v, via: "sweep" });
    }
    setCobs(cs);
    setRows((r) => [...add.reverse(), ...r]);
    setHidden([]);
    setSweeps((s) => s + 1);
  };
  const reset = () => {
    setCobs(initialCobs());
    setIdx(0);
    setRows([]);
    setHidden([]);
    setSweeps(0);
  };

  const ok = rows.filter((r) => r.v.tone === "ok" || r.v.tone === "info").length;
  const act = rows.filter((r) => r.v.tone === "bad" || r.v.tone === "warn").length;

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={next} disabled={idx >= STREAM.length}>
          Next incoming Pix ({idx}/{STREAM.length})
        </Button>
        <Button onClick={sweep} disabled={hidden.length === 0}>
          Run GET /pix sweep{hidden.length ? ` (${hidden.length} unseen)` : ""}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
        <span className="font-mono text-[11px] text-faint">GET /pix?inicio=2026-10-02T13:00:00Z&amp;fim=2026-10-02T13:15:00Z</span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel title="Your charges (ledger)">
          <div className="space-y-1.5">
            {cobs.map((c) => (
              <div key={c.txid} className="rounded-md border border-line bg-panel-2/50 px-2 py-1.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono text-faint">{c.kind}</span>
                  <span className="text-ink">{c.label}</span>
                  <span className="ml-auto font-mono text-muted">{c.valor}{c.modalidadeAlteracao === 1 ? " (editable)" : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 font-mono">
                  <span className="min-w-0 break-all text-faint">{c.txid}</span>
                  <span className={c.status === "CONCLUIDA" ? "text-ok" : "text-accent"}>{c.status}</span>
                  {c.paid.length > 1 && <span className="text-bad">{c.paid.length} Pix!</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Incoming Pix → verdict">
          {rows.length === 0 && <div className="text-sm text-faint">Press &quot;Next incoming Pix&quot;.</div>}
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.px.e2e} className={clsx("rounded-md border px-2 py-1.5 text-xs", TONE[r.v.tone])}>
                <div className="flex flex-wrap gap-x-2 font-mono text-[11px]">
                  <span className="text-muted">{r.via === "sweep" ? "via GET /pix" : "via webhook"}</span>
                  <span className="text-ink">{r.px.valor}</span>
                  <span className="min-w-0 break-all text-faint">txid {r.px.txid ?? "—"}</span>
                </div>
                <div className="mt-0.5">{r.v.text}</div>
                {r.px.why && <div className="text-faint">{r.px.why}</div>}
                {r.v.action && <div className="mt-0.5 font-mono text-[11px] text-muted">→ {r.v.action}</div>}
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="reconciled" value={ok} tone="good" />
        <Stat label="needs action" value={act} tone={act ? "bad" : "neutral"} />
        <Stat label="credited, not yet seen" value={hidden.length} tone={hidden.length ? "warn" : "neutral"} hint="money is in the account already" />
        <Stat label="sweeps run" value={sweeps} />
      </div>
      <p className="text-xs text-faint">
        Try: step through all eight Pix without sweeping — two credits never show up (one has no txid, one lost its webhook) and order 4473 stays ATIVA although it was paid. Then run the sweep. The duplicate payment of order 4471 is the classic case for a devolução.
      </p>
    </div>
  );
}
