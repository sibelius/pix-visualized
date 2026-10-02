"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider } from "@/components/ui";
import { TextField } from "@/components/spi/Field";
import { addMs, PAYEE_PSP, rtrId } from "@/components/spi/xml";
import { ORIGINAL } from "./pacs004";

type Natureza = "ORIGINAL" | "RETIRADA";
type Dev = { id: string; rtrId: string; valor: string; natureza: Natureza; descricao?: string; horario: { solicitacao: string; liquidacao?: string }; status: "EM_PROCESSAMENTO" | "DEVOLVIDO" | "NAO_REALIZADO"; motivo?: string };

const MAPPING = [
  { nat: "ORIGINAL", msg: "pacs.004", code: "MD06", when: "requested by the receiving user: an ordinary Pix, or the purchase part of a Troco", req: true },
  { nat: "RETIRADA", msg: "pacs.004", code: "SL02", when: "a Pix Saque, or the cash part of a Pix Troco", req: true },
  { nat: "MED_OPERACIONAL", msg: "pacs.004", code: "BE08", when: "MED return for an operational failure", req: false },
  { nat: "MED_FRAUDE", msg: "pacs.004", code: "FR01", when: "MED return for well-founded suspicion of fraud", req: false },
  { nat: "MED_PIX_AUTOMATICO", msg: "pacs.008", code: "Purp REFU", when: "MED refund to the payer's PSP in Pix Automático (not a pacs.004 at all)", req: false },
];

export function ApiDevolucao() {
  const [kind, setKind] = useState<"comum" | "saque" | "troco">("comum");
  const [id, setId] = useState("dev001");
  const [valor, setValor] = useState("30.00");
  const [natureza, setNatureza] = useState<Natureza>("ORIGINAL");
  const [descricao, setDescricao] = useState("Estorno do item 3");
  const [days, setDays] = useState(4);
  const [devs, setDevs] = useState<Dev[]>([]);
  const [resp, setResp] = useState<{ code: number; body: unknown } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const total = 100;
  const caps = { comum: { ORIGINAL: 100, RETIRADA: 0 }, saque: { ORIGINAL: 0, RETIRADA: 100 }, troco: { ORIGINAL: 60, RETIRADA: 40 } }[kind];
  const now = addMs(ORIGINAL.at, days * 86_400_000 + 7_200_000);

  const put = () => {
    const problem = (detail: string) =>
      setResp({
        code: 400,
        body: { type: "https://pix.bcb.gov.br/api/v2/error/PixDevolucaoInvalida", title: "Devolução inválida.", status: 400, detail },
      });
    if (!/^[a-zA-Z0-9]{1,35}$/.test(id)) return problem("O parâmetro `id` não respeita o schema [a-zA-Z0-9]{1,35}.");
    if (!/^\d{1,10}\.\d{2}$/.test(valor)) return problem("O campo `valor` não respeita o schema.");
    if (devs.some((d) => d.id === id)) return problem("A presente requisição de devolução apresenta um `id` já utilizado por outra requisição de devolução para o `e2eid` em questão.");
    const v = Number(valor);
    const used = devs.filter((d) => d.status !== "NAO_REALIZADO" && d.natureza === natureza).reduce((s, d) => s + Number(d.valor), 0);
    const usedAll = devs.filter((d) => d.status !== "NAO_REALIZADO").reduce((s, d) => s + Number(d.valor), 0);
    if (usedAll + v > total + 1e-9) return problem("A presente requisição de devolução, em conjunto com as demais prévias devoluções, excederia o valor do pix originário.");
    if (natureza === "ORIGINAL" && caps.ORIGINAL === 0)
      return problem("A presente requisição de devolução não respeita o _schema_ ou não faz sentido semanticamente. (Pix Saque: natureza deve ser RETIRADA.)");
    if (days > 90 && natureza === "ORIGINAL") return problem("A presente requisição de devolução viola a janela de tempo permitida para solicitações de devoluções de um pix (90 dias).");
    const seq = devs.length;
    const dev: Dev = {
      id,
      rtrId: rtrId(PAYEE_PSP.ispb, now, 500 + seq),
      valor: v.toFixed(2),
      natureza,
      ...(descricao ? { descricao } : {}),
      horario: { solicitacao: now },
      status: "EM_PROCESSAMENTO",
    };
    setDevs((d) => [...d, dev]);
    setResp({ code: 201, body: dev });
    // the PSP sends the pacs.004 and later learns the outcome from the pacs.002
    const fails = caps[natureza] === 0 ? "Recusada pelo PSP do pagador (SL02: Pix original não é Saque/Troco)" : used + v > caps[natureza] + 1e-9 ? "Recusada pelo PSP do pagador (AM09)" : undefined;
    const t = window.setTimeout(() => {
      setDevs((list) =>
        list.map((d) =>
          d.id === dev.id
            ? fails
              ? { ...d, status: "NAO_REALIZADO", motivo: fails }
              : { ...d, status: "DEVOLVIDO", horario: { ...d.horario, liquidacao: addMs(now, 1830) } }
            : d,
        ),
      );
    }, 1400);
    timers.current.push(t);
    const next = id.match(/^(.*?)(\d+)$/);
    if (next) setId(next[1] + String(Number(next[2]) + 1).padStart(next[2].length, "0"));
  };

  const reset = () => {
    setDevs([]);
    setResp(null);
    setId("dev001");
  };
  const reqBody = { valor, natureza, ...(descricao ? { descricao } : {}) };

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v);
            reset();
          }}
          options={[
            { value: "comum", label: "Pix comum R$ 100" },
            { value: "saque", label: "Pix Saque R$ 100" },
            { value: "troco", label: "Pix Troco 60 + 40" },
          ]}
        />
        <Slider label="days since the Pix" value={days} min={0} max={120} step={1} onChange={setDays} format={(v) => `${v} d`} className="min-w-56" />
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Request" bodyClassName="space-y-3">
          <div className="rounded-md border border-line bg-bg px-3 py-2 font-mono text-[12px] break-all">
            <span className="text-warn">PUT</span> /pix/<span className="text-info">{ORIGINAL.e2e}</span>/devolucao/<span className="text-accent">{id || "…"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TextField label="{id} (yours, [a-zA-Z0-9]{1,35})" value={id} onChange={setId} />
            <TextField label="valor" value={valor} onChange={setValor} />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">natureza (request accepts only these two)</div>
            <Segmented
              value={natureza}
              onChange={setNatureza}
              options={[
                { value: "ORIGINAL", label: "ORIGINAL → MD06" },
                { value: "RETIRADA", label: "RETIRADA → SL02" },
              ]}
            />
          </div>
          <TextField label="descricao (→ pacs.004 RmtInf/Ustrd, ≤ 140)" value={descricao} onChange={setDescricao} mono={false} />
          <pre className="overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-[11.5px] text-ink">{JSON.stringify(reqBody, null, 2)}</pre>
          <Button variant="primary" onClick={put}>
            Send PUT
          </Button>
        </Panel>
        <Panel title={resp ? `Response ${resp.code}` : "Response"}>
          {resp ? (
            <pre className={clsx("overflow-x-auto rounded-md border bg-bg p-3 font-mono text-[11.5px]", resp.code === 201 ? "border-ok/40 text-ink" : "border-bad/40 text-bad")}>
              {JSON.stringify(resp.body, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-faint">Send a request. A 201 only means the PSP accepted the request and sent the pacs.004; the outcome comes later.</p>
          )}
          <div className="mt-4 font-mono text-xs text-muted">GET /pix/{"{e2eid}"}/devolucao/{"{id}"} for each</div>
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {devs.length === 0 && <li className="text-faint">none yet</li>}
            {devs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono">
                <span className="text-accent">{d.id}</span>
                <span className="text-muted">{d.rtrId}</span>
                <span>{d.valor}</span>
                <span className={clsx(d.status === "DEVOLVIDO" ? "text-ok" : d.status === "NAO_REALIZADO" ? "text-bad" : "text-warn")}>{d.status}</span>
                {d.motivo && <span className="w-full text-[11px] text-faint">motivo: {d.motivo}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="natureza ↔ SPI message" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <tbody>
              {MAPPING.map((m) => (
                <tr key={m.nat} className={clsx("border-b border-line/60 last:border-0", m.nat === natureza && "bg-accent/10")}>
                  <td className="px-3 py-1.5 font-mono text-ink">{m.nat}</td>
                  <td className="px-2 py-1.5 font-mono text-muted">{m.msg}</td>
                  <td className="px-2 py-1.5 font-mono text-accent">{m.code}</td>
                  <td className="px-2 py-1.5 text-muted">{m.when}</td>
                  <td className="px-2 py-1.5 text-[11px] text-faint">{m.req ? "in requests" : "responses only"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: return 30.00 and 50.00 (dev001, dev002), then 30.00 again: the API itself answers 400 PixDevolucaoInvalida, before any pacs.004 is sent. Reuse an id: also
        400, because {"{id}"} is your idempotency handle for the devolução. On a Pix comum, send RETIRADA: the API accepts it, the pacs.004 goes out with SL02 and the payer&apos;s
        PSP refuses it, so the status ends NAO_REALIZADO. Move past day 90 with ORIGINAL.
      </p>
    </div>
  );
}
