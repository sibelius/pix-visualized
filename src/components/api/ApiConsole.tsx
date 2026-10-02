"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Panel, Stat } from "@/components/ui";
import { JsonView } from "./JsonView";
import { ENDPOINTS, OWNED_KEYS, handle, newPsp, payCob, type Endpoint, type Json, type Psp, type Res } from "./mockPsp";

const METHOD_COLOR: Record<string, string> = { GET: "#38bdf8", PUT: "#fbbf24", POST: "#34d399", PATCH: "#c084fc" };

function fillPath(p: Psp, ep: Endpoint): string {
  const cobs = [...p.cobs.values()];
  const lastCob = [...cobs].reverse().find((c) => c.kind === "cob");
  const lastCobv = [...cobs].reverse().find((c) => c.kind === "cobv");
  const lastPix = [...p.pix.values()].pop();
  const lastLoc = [...p.locs.values()].pop();
  const lastDev = lastPix?.devolucoes[lastPix.devolucoes.length - 1];
  const txid =
    ep.path.startsWith("/cobv") ? lastCobv?.txid ?? "fc9a4366ff3d4964b5dbc6c91a8722d3" : ep.path.startsWith("/cobr") ? "3136957d93134f2184b369e8f1c0729d" : ep.method === "PUT" ? "7978c0c97ea847e78e8849634473c1f1" : lastCob?.txid ?? "7978c0c97ea847e78e8849634473c1f1";
  const id = ep.path.startsWith("/lotecobv") ? "1" : ep.path.startsWith("/loc") ? String(lastLoc?.id ?? 7716) : ep.method === "GET" ? lastDev?.id ?? "D001" : "D001";
  return ep.path
    .replace("{txid}", txid)
    .replace("{e2eid}", lastPix?.endToEndId ?? "E00000000202610021300xxxxxxxxxxx")
    .replace("{id}", id)
    .replace("{chave}", encodeURIComponent(OWNED_KEYS[0]));
}

type LogEntry = { n: number; method: string; path: string; status: number };

export function ApiConsole() {
  const [psp, setPsp] = useState<Psp>(() => newPsp());
  const [, force] = useState(0);
  const [epId, setEpId] = useState("put-cob");
  const ep = ENDPOINTS.find((e) => e.id === epId)!;
  const [path, setPath] = useState(() => fillPath(psp, ep));
  const [bodyText, setBodyText] = useState(() => (ep.body ? JSON.stringify(ep.body(psp), null, 2) : ""));
  const [res, setRes] = useState<Res | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const choose = (id: string) => {
    const e = ENDPOINTS.find((x) => x.id === id)!;
    setEpId(id);
    setPath(fillPath(psp, e));
    setBodyText(e.body ? JSON.stringify(e.body(psp), null, 2) : "");
    setParseErr(null);
  };

  const send = () => {
    let body: Json | undefined;
    if (ep.method !== "GET" && bodyText.trim()) {
      try {
        body = JSON.parse(bodyText) as Json;
      } catch (e) {
        setParseErr(String((e as Error).message));
        setRes({
          status: 400,
          contentType: "application/problem+json",
          body: { type: "https://pix.bcb.gov.br/api/v2/error/RequisicaoInvalida", title: "Requisição inválida.", status: 400, detail: "O corpo da requisição não é um JSON válido." },
        });
        return;
      }
    }
    setParseErr(null);
    const r = handle(psp, ep.method, path, body);
    setRes(r);
    setLog((l) => [{ n: (l[0]?.n ?? 0) + 1, method: ep.method, path, status: r.status }, ...l].slice(0, 8));
    force((x) => x + 1);
  };

  const pay = (txid: string) => {
    payCob(psp, txid);
    force((x) => x + 1);
  };
  const reset = () => {
    const p = newPsp();
    setPsp(p);
    setRes(null);
    setLog([]);
    setPath(fillPath(p, ep));
    setBodyText(ep.body ? JSON.stringify(ep.body(p), null, 2) : "");
  };

  const groups = useMemo(() => {
    const g = new Map<string, Endpoint[]>();
    for (const e of ENDPOINTS) g.set(e.tag, [...(g.get(e.tag) ?? []), e]);
    return [...g.entries()];
  }, []);

  const cobs = [...psp.cobs.values()];
  const statusTone = (s: number) => (s < 300 ? "text-ok" : s < 500 ? "text-bad" : "text-warn");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="Endpoints (API Pix v2.10.0)" bodyClassName="p-2">
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {groups.map(([tag, eps]) => (
              <div key={tag}>
                <div className="px-2 pt-1 text-[10px] tracking-wide text-faint uppercase">{tag}</div>
                {eps.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => choose(e.id)}
                    className={clsx("flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left font-mono text-[11.5px]", e.id === epId ? "bg-line text-ink" : "text-muted hover:bg-panel-2")}
                  >
                    <span className="w-11 shrink-0 font-semibold" style={{ color: METHOD_COLOR[e.method] }}>
                      {e.method}
                    </span>
                    <span className="min-w-0 break-all">{e.path.split("?")[0]}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel
            title="Request"
            right={
              <span className="rounded-md border border-line bg-panel-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                scope: <span className="text-accent">{ep.scope}</span>
              </span>
            }
          >
            <div className="text-sm text-muted">{ep.summary}</div>
            <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-xs">
              <span className="shrink-0 font-semibold" style={{ color: METHOD_COLOR[ep.method] }}>
                {ep.method}
              </span>
              <span className="hidden shrink-0 text-faint sm:inline">https://pix.example.com/api/v2</span>
              <input value={path} onChange={(e) => setPath(e.target.value)} className="min-w-0 flex-1 bg-transparent text-ink outline-none" spellCheck={false} />
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-faint">
              Authorization: Bearer eyJ… (cert-bound, see Security) · mTLS client certificate required · Content-Type: application/json
            </div>
            {ep.method !== "GET" && (
              <>
                {ep.presets && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-faint">try a body:</span>
                    <button type="button" className="rounded-md border border-line px-2 py-0.5 text-muted hover:text-ink" onClick={() => setBodyText(ep.body ? JSON.stringify(ep.body(psp), null, 2) : "")}>
                      valid
                    </button>
                    {ep.presets.map((pr) => (
                      <button key={pr.label} type="button" className="rounded-md border border-bad/40 px-2 py-0.5 text-muted hover:text-ink" onClick={() => setBodyText(JSON.stringify(pr.body(psp), null, 2))}>
                        {pr.label}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  spellCheck={false}
                  rows={Math.min(18, Math.max(4, bodyText.split("\n").length))}
                  className="mt-2 w-full rounded-lg border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-ink outline-none focus:border-faint"
                />
                {parseErr && <div className="font-mono text-xs text-bad">{parseErr}</div>}
              </>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={send}>
                Send
              </Button>
              <Button variant="ghost" onClick={reset}>
                Reset PSP
              </Button>
            </div>
          </Panel>
          <Panel
            title="Response"
            right={
              res && (
                <span className="font-mono text-xs">
                  <span className={statusTone(res.status)}>{res.status}</span>{" "}
                  <span className="text-faint">{res.body === undefined ? "(no body)" : res.contentType ?? "application/json"}</span>
                </span>
              )
            }
          >
            {res ? (
              <>
                {res.note && <div className="mb-2 rounded-md bg-panel-2 px-2 py-1 text-xs text-muted">{res.note}</div>}
                {res.body !== undefined ? <JsonView value={res.body} /> : <div className="font-mono text-xs text-faint">empty body</div>}
              </>
            ) : (
              <div className="text-sm text-faint">Press Send. The mock PSP keeps state across calls: create a cob, read it back, pay it, refund it.</div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title={`PSP state · charges (${cobs.length})`}>
          {cobs.length === 0 ? (
            <div className="text-sm text-faint">No charges yet.</div>
          ) : (
            <div className="space-y-1.5">
              {cobs.map((c) => (
                <div key={c.txid} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-panel-2/50 px-2 py-1.5 font-mono text-[11px]">
                  <span className="text-faint">{c.kind}</span>
                  <span className="min-w-0 break-all text-ink">{c.txid}</span>
                  <span className={c.status === "ATIVA" ? "text-accent" : c.status === "CONCLUIDA" ? "text-ok" : "text-bad"}>{c.status}</span>
                  <span className="text-muted">rev {c.revisao}</span>
                  <span className="text-muted">loc {c.locId}</span>
                  {c.status === "ATIVA" && (
                    <button type="button" onClick={() => pay(c.txid)} className="ml-auto rounded-md border border-ok/50 px-2 py-0.5 font-sans text-[11px] text-ok hover:bg-ok/10">
                      a payer pays it
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Pix received" value={psp.pix.size} />
            <Stat label="locations" value={psp.locs.size} />
            <Stat label="webhooks" value={psp.webhooks.size + (psp.webhookRec ? 1 : 0) + (psp.webhookCobR ? 1 : 0)} />
          </div>
        </Panel>
        <Panel title="Request log & outgoing callbacks">
          <div className="space-y-1 font-mono text-[11px]">
            {log.length === 0 && <div className="font-sans text-sm text-faint">No requests yet.</div>}
            {log.map((l) => (
              <div key={l.n} className="flex min-w-0 gap-2">
                <span className="w-5 shrink-0 text-faint">{l.n}</span>
                <span className="w-11 shrink-0" style={{ color: METHOD_COLOR[l.method] }}>
                  {l.method}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">{l.path}</span>
                <span className={statusTone(l.status)}>{l.status}</span>
              </div>
            ))}
          </div>
          {psp.deliveries[0] && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-muted">
                PSP → you: <span className="font-mono text-[#34d399]">POST</span> <span className="font-mono text-ink break-all">{psp.deliveries[0].url}</span> (mTLS)
              </div>
              <JsonView value={psp.deliveries[0].body} maxHeight={200} />
            </div>
          )}
          {!psp.deliveries[0] && <div className="mt-3 text-xs text-faint">Register PUT /webhook/{"{chave}"} and pay a cob to see the callback the PSP would POST.</div>}
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: PUT /cob with the &quot;valor 0.00&quot; body to get a <span className="font-mono">CobOperacaoInvalida</span> with <span className="font-mono">violacoes</span>; send the valid body twice (the second PUT is a no-op,
        revisao stays 0); PATCH it, then GET <span className="font-mono">/cob/{"{txid}"}?revisao=0</span>; click &quot;a payer pays it&quot; and try to PATCH again; refund the Pix with PUT /pix/{"{e2eid}"}/devolucao/D001 and GET it twice.
      </p>
    </div>
  );
}
