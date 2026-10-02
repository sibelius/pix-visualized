"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { compact, cycleStart, day, iso, pretty, type Periodicidade } from "./dates";
import { buildIdRec, parseIdRec, seq11 } from "./ids";

const PERS: Periodicidade[] = ["SEMANAL", "MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"];
const PART_COLORS = ["#34d399", "#fbbf24", "#a78bfa", "#22d3ee", "#f472b6"];

const brl = (v: number) => v.toFixed(2);

export function RecBuilder() {
  const [origin, setOrigin] = useState<"pix" | "of">("pix");
  const [retry, setRetry] = useState<"PERMITE_3R_7D" | "NAO_PERMITE">("PERMITE_3R_7D");
  const [per, setPer] = useState<Periodicidade>("MENSAL");
  const [firstDay, setFirstDay] = useState(31);
  const [mode, setMode] = useState<"fixo" | "variavel">("variavel");
  const [valor, setValor] = useState(89.9);
  const [piso, setPiso] = useState(50);
  const [max, setMax] = useState(120);
  const [hasEnd, setHasEnd] = useState<"no" | "yes">("no");
  const [paste, setPaste] = useState("");

  const created = day(2026, 10, 2);
  const first = day(2026, 10, firstDay);
  const agent = "12345678";
  const idRec = buildIdRec({ openFinance: origin === "of", retries: retry === "PERMITE_3R_7D", agent, date: compact(created), seq: seq11(482_771_903 + firstDay) });
  const parsed = parseIdRec(paste || idRec);
  const cycles = Array.from({ length: 7 }, (_, k) => cycleStart(first, per, k));
  const end = hasEnd === "yes" ? cycles[5] + 5 : undefined;

  const issues: { ok: boolean; text: string }[] = [];
  if (mode === "variavel") {
    issues.push({
      ok: max >= piso,
      text: max >= piso ? `payer's valor máximo R$ ${brl(max)} ≥ receiver's floor R$ ${brl(piso)}` : `valor máximo R$ ${brl(max)} is below the floor (valorMinimoRecebedor R$ ${brl(piso)}): the payer's app must refuse it`,
    });
    issues.push({ ok: true, text: "valorRec omitted: amount varies per cobrança (each one checked against valor máximo at scheduling time)" });
  } else {
    issues.push({ ok: true, text: `valorRec "${brl(valor)}": every pain.013 must carry exactly this amount (else AM09)` });
    issues.push({ ok: true, text: "valorMinimoRecebedor must NOT be sent with valorRec (they are mutually exclusive)" });
  }
  if (origin === "of") issues.push({ ok: true, text: "C… ids come from an ITP via Open Finance consent — the API Pix POST /rec only creates R… ids" });
  if (end !== undefined) issues.push({ ok: true, text: `dataFinal ${iso(end)} a few days after the last expected payment, so a late cycle or retries still fit` });

  const body: Record<string, unknown> = {
    vinculo: { objeto: "Plano Família 300 Mega", contrato: "CT-2026-004417", devedor: { cpf: "12345678909", nome: "Maria Fictícia" } },
    calendario: { dataInicial: iso(first), ...(end !== undefined ? { dataFinal: iso(end) } : {}), periodicidade: per },
    valor: mode === "fixo" ? { valorRec: brl(valor) } : { valorMinimoRecebedor: brl(piso) },
    politicaRetentativa: retry,
  };
  const resp = { idRec, ...body, recebedor: { cnpj: "11222333000181", nome: "Fibra Exemplo Telecom" }, status: "CRIADA", ativacao: { tipoJornada: "AGUARDANDO_DEFINICAO" } };

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          created by
          <Segmented value={origin} onChange={setOrigin} options={[{ value: "pix", label: "receiver PSP (Pix)" }, { value: "of", label: "ITP (Open Finance)" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          politicaRetentativa
          <Segmented value={retry} onChange={setRetry} options={[{ value: "PERMITE_3R_7D", label: "PERMITE_3R_7D" }, { value: "NAO_PERMITE", label: "NAO_PERMITE" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          periodicidade
          <Segmented value={per} onChange={setPer} options={PERS.map((p) => ({ value: p, label: p.toLowerCase() }))} />
        </span>
      </Controls>
      <Controls>
        <Slider label="first payment (Oct 2026, day)" value={firstDay} min={5} max={31} onChange={setFirstDay} className="min-w-56 flex-1" />
        <span className="inline-flex items-center gap-2 text-muted">
          amount
          <Segmented value={mode} onChange={setMode} options={[{ value: "fixo", label: "fixed (valorRec)" }, { value: "variavel", label: "variable" }]} />
        </span>
        {mode === "fixo" ? (
          <Slider label="valorRec" value={valor} min={10} max={300} step={0.1} onChange={setValor} format={(v) => `R$ ${brl(v)}`} className="min-w-56 flex-1" />
        ) : (
          <>
            <Slider label="floor (receiver)" value={piso} min={0} max={200} step={5} onChange={setPiso} format={(v) => `R$ ${brl(v)}`} className="min-w-52 flex-1" />
            <Slider label="valor máximo (payer)" value={max} min={10} max={300} step={5} onChange={setMax} format={(v) => `R$ ${brl(v)}`} className="min-w-52 flex-1" />
          </>
        )}
        <span className="inline-flex items-center gap-2 text-muted">
          dataFinal
          <Segmented value={hasEnd} onChange={setHasEnd} options={[{ value: "no", label: "open-ended" }, { value: "yes", label: "6 cycles" }]} />
        </span>
      </Controls>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="idRec — 29 characters, case-sensitive">
          <div className="flex flex-wrap gap-1 font-mono text-[15px]">
            {parsed.parts.map((p, k) => (
              <span key={k} className="rounded px-1 py-0.5" style={{ background: `${PART_COLORS[k]}1f`, color: p.ok ? PART_COLORS[k] : "#f87171", outline: p.ok ? undefined : "1px solid #f87171" }}>
                {p.value || "∅"}
              </span>
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {parsed.parts.map((p, k) => (
              <li key={k} className="flex gap-2">
                <span className="w-20 shrink-0 font-mono text-[11px]" style={{ color: PART_COLORS[k] }}>
                  {p.label}
                </span>
                <span className={clsx(p.ok ? "text-muted" : "text-bad")}>{p.ok ? p.note : `invalid — ${p.note}`}</span>
              </li>
            ))}
          </ul>
          <label className="mt-3 block text-xs text-faint">
            paste any idRec to parse it
            <input
              value={paste}
              onChange={(e) => setPaste(e.target.value.trim())}
              placeholder={idRec}
              className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink"
            />
          </label>
          <div className={clsx("mt-2 font-mono text-xs", parsed.ok ? "text-ok" : "text-bad")}>
            {parsed.ok ? "✓ matches [R|C][R|N][0-9A-Z]{8}yyyyMMdd[a-zA-Z0-9]{11}" : `✗ ${paste.length || idRec.length} chars — not a valid idRec`}
          </div>
        </Panel>

        <Panel title="Cycles (ciclos) from the first payment date">
          <ol className="space-y-1 font-mono text-[12.5px]">
            {cycles.slice(0, 6).map((c, k) => {
              const next = cycles[k + 1];
              const clamped = per !== "SEMANAL" && Number(iso(c).slice(8)) !== firstDay;
              return (
                <li key={k} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-6 text-faint">#{k + 1}</span>
                  <span className={clamped ? "text-warn" : "text-ink"}>{pretty(c)}</span>
                  <span className="text-faint">→ {pretty(next - 1)}</span>
                  {clamped && <span className="text-[11px] text-warn">(day {firstDay} missing → last existing day)</span>}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[13px] text-muted">
            Exactly one cobrança may be scheduled per cycle. The receiver may postpone a due date inside the cycle (never into the next one) — without charging
            late fees for it.
          </p>
          <ul className="mt-3 space-y-1 text-[13px]">
            {issues.map((x, k) => (
              <li key={k} className={x.ok ? "text-ok" : "text-bad"}>
                {x.ok ? "✓" : "✗"} <span className="text-muted">{x.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="POST /rec  (scope rec.write)" right={<span className="font-mono text-[11px] text-faint">request</span>}>
          <pre className="overflow-x-auto text-[12px] leading-relaxed text-ink/90">{JSON.stringify(body, null, 2)}</pre>
        </Panel>
        <Panel title="201 Created" right={<span className="font-mono text-[11px] text-faint">RecGerada</span>}>
          <pre className="overflow-x-auto text-[12px] leading-relaxed text-ink/90">{JSON.stringify(resp, null, 2)}</pre>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="id length" value={idRec.length} tone="good" />
        <Stat label="retries flag" value={idRec[1]} hint="2nd char of idRec" />
        <Stat label="valor máximo" value={mode === "fixo" ? "n/a" : `R$ ${brl(max)}`} hint="never leaves the payer PSP" tone={mode === "variavel" && max < piso ? "bad" : undefined} />
        <Stat label="first due" value={iso(first)} hint="calendario.dataInicial" />
      </div>
      <p className="text-xs text-faint">
        Try: set the first payment to day 31 with monthly periodicity and watch November and February clamp; flip politicaRetentativa and watch the second character of
        the idRec change; push the payer&apos;s valor máximo below the floor.
      </p>
    </div>
  );
}
