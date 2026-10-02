"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented } from "@/components/ui";
import { call, ENDPOINTS, type ApiResult, type EndpointKey, type ServerState } from "./apiSim";

const KEYS = Object.keys(ENDPOINTS) as EndpointKey[];

export function ApiPlayground() {
  const [ep, setEp] = useState<EndpointKey>("cobr");
  const [path, setPath] = useState(ENDPOINTS.cobr.path);
  const [raw, setRaw] = useState(JSON.stringify(ENDPOINTS.cobr.body, null, 2));
  const [st, setSt] = useState<ServerState>({ recStatus: "APROVADA", politica: "PERMITE_3R_7D", pendingSolic: false, cobrInCycle: false, tentativaAberta: false });
  const [res, setRes] = useState<ApiResult | null>(null);
  const E = ENDPOINTS[ep];

  const pick = (k: EndpointKey) => {
    setEp(k);
    setPath(ENDPOINTS[k].path);
    setRaw(ENDPOINTS[k].body === null ? "" : JSON.stringify(ENDPOINTS[k].body, null, 2));
    setRes(null);
  };
  const send = () => setRes(call(ep, path, raw, st));
  const flag = <K extends keyof ServerState>(k: K, v: ServerState[K]) => {
    setSt((s) => ({ ...s, [k]: v }));
    setRes(null);
  };

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented value={ep} onChange={pick} options={KEYS.map((k) => ({ value: k, label: `${ENDPOINTS[k].method} ${ENDPOINTS[k].path.split("/")[1]}${k === "retentativa" ? "/…/retentativa" : ""}` }))} />
      </Controls>
      <Controls>
        <span className="text-xs font-semibold tracking-wide text-faint uppercase">server state</span>
        <span className="inline-flex items-center gap-2 text-muted">
          rec
          <Segmented value={st.recStatus} onChange={(v) => flag("recStatus", v)} options={[{ value: "CRIADA", label: "CRIADA" }, { value: "APROVADA", label: "APROVADA" }, { value: "CANCELADA", label: "CANCELADA" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          policy
          <Segmented value={st.politica} onChange={(v) => flag("politica", v)} options={[{ value: "PERMITE_3R_7D", label: "PERMITE_3R_7D" }, { value: "NAO_PERMITE", label: "NAO_PERMITE" }]} />
        </span>
        <Button className="!px-2 !py-1 !text-xs" onClick={() => flag("pendingSolic", !st.pendingSolic)}>
          {st.pendingSolic ? "✓" : "○"} solicitação pending
        </Button>
        <Button className="!px-2 !py-1 !text-xs" onClick={() => flag("cobrInCycle", !st.cobrInCycle)}>
          {st.cobrInCycle ? "✓" : "○"} Nov cobr exists
        </Button>
        <Button className="!px-2 !py-1 !text-xs" onClick={() => flag("tentativaAberta", !st.tentativaAberta)}>
          {st.tentativaAberta ? "✓" : "○"} attempt still AGENDADA
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={E.title}
          right={
            <span className="font-mono text-[11px] text-faint">
              OAuth2 scope <span className="text-ink">{E.scope}</span>
            </span>
          }
        >
          <div className="mb-2 flex min-w-0 items-center gap-2 font-mono text-xs">
            <span className="rounded bg-[#a3e635]/15 px-1.5 py-0.5 text-[#a3e635]">{E.method}</span>
            <input value={path} onChange={(e) => setPath(e.target.value)} className="min-w-0 flex-1 rounded border border-line bg-panel-2 px-2 py-1 text-ink" />
          </div>
          {E.body !== null ? (
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
              rows={18}
              className="w-full resize-y rounded-md border border-line bg-panel-2 p-2 font-mono text-[12px] leading-relaxed text-ink"
            />
          ) : (
            <p className="text-sm text-muted">No body: the date in the path is the requested settlement date of the new attempt.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={send}>
              Send
            </Button>
            <Button variant="ghost" onClick={() => pick(ep)}>
              Reset body
            </Button>
          </div>
        </Panel>
        <Panel
          title="response"
          right={
            res && (
              <span className={clsx("font-mono text-xs", res.status < 300 ? "text-ok" : "text-bad")}>
                HTTP {res.status} {res.status < 300 ? "" : "application/problem+json"}
              </span>
            )
          }
        >
          {res ? (
            <pre className="overflow-x-auto text-[12px] leading-relaxed text-ink/90">{JSON.stringify(res.body, null, 2)}</pre>
          ) : (
            <p className="text-sm text-faint">Press Send. Validation follows the violations listed in API Pix 2.10 for this endpoint.</p>
          )}
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: create the cobrança, then tick &quot;Nov cobr exists&quot; and send again (one cobrança per cycle); set the vencimento to 2026-09-30; delete
        ajusteDiaUtil; switch policy to NAO_PERMITE and ask for a retentativa; send a solicitação for a recorrência that is already APROVADA.
      </p>
    </div>
  );
}
