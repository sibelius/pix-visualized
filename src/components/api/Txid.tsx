"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Callout, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { TXID_RULES, makeTxid, simulateIdempotency, type Attempt } from "./txidModel";

const CELL: Record<Attempt, { c: string; t: string }> = {
  "lost-req": { c: "#5a6275", t: "request lost before the PSP" },
  "lost-resp": { c: "#fbbf24", t: "PSP processed it, response lost (client timeout)" },
  ok: { c: "#34d399", t: "response received" },
};

export function Txid() {
  const [txid, setTxid] = useState("pedido4471x9QmZt2LkVbN8rWcYfHs");
  const [mode, setMode] = useState<"PUT" | "POST">("PUT");
  const [pReq, setPReq] = useState(0.15);
  const [pResp, setPResp] = useState(0.3);
  const [seed, setSeed] = useState(7);
  const orders = useMemo(() => simulateIdempotency({ mode, orders: 14, pReq, pResp, maxTries: 4, seed }), [mode, pReq, pResp, seed]);
  const created = orders.reduce((a, o) => a + o.serverCobs, 0);
  const known = orders.filter((o) => o.clientKnows).length;
  const orphans = mode === "POST" ? orders.reduce((a, o) => a + Math.max(0, o.serverCobs - (o.clientKnows ? 1 : 0)), 0) : orders.filter((o) => o.serverCobs > 0 && !o.clientKnows).length;
  const charsOk = /^[a-zA-Z0-9]*$/.test(txid);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="txid validator — one string, six contexts">
          <input
            value={txid}
            onChange={(e) => setTxid(e.target.value)}
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-faint"
          />
          <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-[11px] text-faint">
            <span>length {txid.length}</span>
            <span className={charsOk ? "" : "text-bad"}>{charsOk ? "charset [a-zA-Z0-9] ok" : "has chars outside [a-zA-Z0-9] (no '-', '_', spaces)"}</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {TXID_RULES.map((r) => {
              const ok = r.re.test(txid);
              return (
                <div key={r.ctx} className="flex items-start gap-2 text-xs">
                  <span className={clsx("mt-0.5 w-4 shrink-0 font-mono", ok ? "text-ok" : "text-bad")}>{ok ? "✓" : "✗"}</span>
                  <span className="min-w-0">
                    <span className="text-ink">{r.ctx}</span> <span className="font-mono text-faint">{r.desc}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setTxid(makeTxid("pedido-4471", seed + txid.length))}>Generate from order id</Button>
            <Button variant="ghost" onClick={() => setTxid("7d9f0335-8dcc-4054-9bf9-0dbd61d36906")}>
              Use a UUID with dashes
            </Button>
            <Button variant="ghost" onClick={() => setTxid("CAIXA02")}>
              Short static txid
            </Button>
          </div>
          <p className="mt-3 text-xs text-faint">
            Uniqueness: per recebedor CPF/CNPJ at that PSP, across cob <em>and</em> cobv, forever — a txid cannot be reused even after the charge was removed. Static QRs are not registered, so the PSP cannot enforce uniqueness there.
          </p>
        </Panel>

        <Panel title="Idempotency on a flaky network">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "PUT", label: "PUT /cob/{txid} (you pick txid)" },
                { value: "POST", label: "POST /cob (PSP picks txid)" },
              ]}
            />
            <Slider label="request lost" value={pReq} min={0} max={0.6} step={0.05} onChange={setPReq} format={(v) => `${Math.round(v * 100)}%`} className="min-w-44 flex-1" />
            <Slider label="response lost" value={pResp} min={0} max={0.7} step={0.05} onChange={setPResp} format={(v) => `${Math.round(v * 100)}%`} className="min-w-44 flex-1" />
            <Button onClick={() => setSeed((s) => s + 1)}>Re-run</Button>
          </div>
          <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 font-mono text-[11px]">
            {orders.map((o, i) => (
              <div key={i} className="contents">
                <span className="text-faint">order {String(i + 1).padStart(2, "0")}</span>
                <span className="flex gap-1">
                  {o.attempts.map((a, j) => (
                    <span key={j} title={CELL[a].t} className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: CELL[a].c }} />
                  ))}
                </span>
                <span className={clsx(o.serverCobs > 1 ? "text-bad" : o.serverCobs === 1 ? "text-muted" : "text-faint")}>
                  {o.serverCobs} cob{o.serverCobs === 1 ? "" : "s"}
                  {o.clientKnows ? "" : " · client gave up"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-faint">
            {(Object.keys(CELL) as Attempt[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CELL[k].c }} />
                {CELL[k].t}
              </span>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="orders" value={orders.length} />
        <Stat label="cobs on the PSP" value={created} tone={created > orders.length ? "bad" : "neutral"} />
        <Stat label="orders client can track" value={known} />
        <Stat label="orphan / unknown cobs" value={orphans} tone={orphans ? (mode === "POST" ? "bad" : "warn") : "good"} hint={mode === "PUT" ? "retry later with the same txid recovers them" : "you never learn their txid"} />
      </div>
      <Callout tone={mode === "POST" ? "bad" : "ok"}>
        {mode === "PUT"
          ? "With PUT, the txid is the idempotency key: a replay with the same body is a no-op (revisao unchanged) and a later GET /cob/{txid} tells you whether it exists. The Manual says this is exactly why the recebedor should generate the txid."
          : "With POST, every request the PSP processes mints a new txid. When the response is lost you have no handle on the charge: duplicates pile up, and a payer could even be shown one you don't know about. The Manual warns that idempotency cannot be guaranteed when the PSP generates the txid."}
      </Callout>
      <p className="text-xs text-faint">Try: set response lost to 50% and flip between PUT and POST — the server-side count stays at one per order only with PUT.</p>
    </div>
  );
}
