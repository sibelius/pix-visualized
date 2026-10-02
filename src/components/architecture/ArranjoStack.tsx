"use client";

import { useState } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui";

type DocId =
  | "res1"
  | "marca"
  | "padroes"
  | "fluxos"
  | "ux"
  | "redes"
  | "seguranca"
  | "catalogo"
  | "icom"
  | "tempos"
  | "dict"
  | "disputas"
  | "penalidades"
  | "res195"
  | "str";

type Doc = { id: DocId; label: string; side: "arranjo" | "infra"; note: string };

/** Regulamento Pix art. 2º lists the 12 documents that compose it; the SPI has its own regulation (Res. BCB nº 195/2022). */
const DOCS: Doc[] = [
  { id: "res1", label: "Resolução BCB nº 1/2020 — Regulamento Pix", side: "arranjo", note: "Institutes the arranjo, participation, obligations, MED, limits, fees policy. Amended dozens of times." },
  { id: "marca", label: "I · Manual de Uso da Marca", side: "arranjo", note: "How the Pix logo may be used." },
  { id: "padroes", label: "II · Manual de Padrões para Iniciação", side: "arranjo", note: "BR Code / QR (EMV TLV), payload JSON/JWS, NFC." },
  { id: "fluxos", label: "III · Manual de Fluxos do Processo de Efetivação", side: "arranjo", note: "Step tables for every settlement and return flow." },
  { id: "ux", label: "IV · Requisitos Mínimos para a Experiência do Usuário", side: "arranjo", note: "What apps must show and allow." },
  { id: "redes", label: "V · Manual de Redes do SFN", side: "arranjo", note: "RSFN connectivity." },
  { id: "seguranca", label: "VI · Manual de Segurança do SFN", side: "arranjo", note: "Certificates, XMLDSig profile, mTLS." },
  { id: "catalogo", label: "VII · Catálogo de Serviços do SFN (Vol. VI = SPI)", side: "arranjo", note: "The ISO 20022 messages, XSDs and flows." },
  { id: "icom", label: "VIII · Manual das Interfaces de Comunicação", side: "arranjo", note: "ICOM and DICT HTTP interfaces." },
  { id: "tempos", label: "IX · Manual de Tempos do Pix", side: "arranjo", note: "Time limits and SLA percentiles." },
  { id: "dict", label: "X · Manual Operacional do DICT", side: "arranjo", note: "Keys, claims, portability, anti-scan, MED in the DICT." },
  { id: "disputas", label: "XI · Manual de Resolução de Disputas", side: "arranjo", note: "Disputes between participants." },
  { id: "penalidades", label: "XII · Manual de Penalidades (Res. BCB nº 177/2021)", side: "arranjo", note: "Fines and sanctions for breaking the rules." },
  { id: "res195", label: "Resolução BCB nº 195/2022 — Regulamento do SPI e da Conta PI", side: "infra", note: "Who may hold a Conta PI, no overdraft, fund holds, settlement finality, fees, remuneration." },
  { id: "str", label: "STR rules + Catálogo do SFN Vols. I–IV (LPI messages)", side: "infra", note: "How liquidity moves between reserves and the Conta PI." },
];

const QUESTIONS: { q: string; a: string; docs: DocId[] }[] = [
  { q: "Who is obliged to offer Pix?", a: "Authorized FIs and IPs with more than 500,000 active customer accounts (art. 3º of the Resolution itself).", docs: ["res1"] },
  { q: "How long may a Pix take?", a: "40 s on the primary channel, 45 min on the secondary; past that the SPI rejects it (AB03).", docs: ["tempos", "res195"] },
  { q: "Can a Conta PI go negative?", a: "No. Holds are taken before settlement and an order without balance is rejected at once (AM04).", docs: ["res195"] },
  { q: "Which fields does a pacs.008 carry?", a: "Defined by the SPI XSDs and filling rules in spi.5.13.1.zip, part of the Catálogo.", docs: ["catalogo"] },
  { q: "How are messages signed and connections authenticated?", a: "XMLDSig RSA-SHA256 with ICP-Brasil certificates; mTLS to ICOM and DICT.", docs: ["seguranca", "icom"] },
  { q: "What does a static QR code contain?", a: "EMV MPM TLV fields with GUI br.gov.bcb.pix and a CRC16.", docs: ["padroes"] },
  { q: "How long does a key ownership claim last?", a: "7 days to resolve, plus completion; the DICT manual has the timers.", docs: ["dict"] },
  { q: "What must the app show before the payer confirms?", a: "Payee name and (masked) document, amount, PSP; the UX requirements list it.", docs: ["ux"] },
  { q: "What happens if a PSP misses its SLAs?", a: "Indicators come from the Manual de Tempos; sanctions from the Manual de Penalidades.", docs: ["tempos", "penalidades"] },
  { q: "How does a PSP top up its Conta PI on a Sunday?", a: "It can't: STR transfers (LPI0001) only run on business days, so PSPs pre-fund before weekends.", docs: ["str", "res195"] },
  { q: "Who pays the BCB, and how much?", a: "The receiving direct participant: R$ 0.01 per 10 Pix settled; the payer side pays nothing.", docs: ["res195"] },
];

const TIMELINE: { d: string; t: string }[] = [
  { d: "2020-08-12", t: "Res. BCB 1: arranjo Pix instituted" },
  { d: "2020-11-16", t: "Pix launches for everyone" },
  { d: "2021-07-22", t: "Res. 118: initiator (ITP) modality" },
  { d: "2021-12-22", t: "Res. 177: Manual de Penalidades" },
  { d: "2022-03-03", t: "Res. 195: SPI & Conta PI regulation" },
  { d: "2024-07-22", t: "Res. 402/403: Pix Automático; instituição usuária" },
  { d: "2024-11-11", t: "Res. 429: only BCB-authorized institutions" },
  { d: "2025-03-06", t: "Res. 457: security rules for keys" },
  { d: "2025-06-16", t: "Pix Automático goes live" },
  { d: "2025-08-28", t: "Res. 493: MED and key-data changes" },
  { d: "2026-04-23", t: "Res. 559: Saque/Troco facilitator, IPs" },
  { d: "2026-09-18", t: "Res. 587: latest amendment (this site's snapshot)" },
];

export function ArranjoStack() {
  const [qi, setQi] = useState(1);
  const q = QUESTIONS[qi];
  const on = new Set(q.docs);
  const col = (side: Doc["side"]) => DOCS.filter((d) => d.side === side);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Ask a question">
          <ul className="space-y-1">
            {QUESTIONS.map((x, i) => (
              <li key={x.q}>
                <button
                  type="button"
                  onClick={() => setQi(i)}
                  className={clsx("w-full rounded-md px-2 py-1.5 text-left text-xs", i === qi ? "bg-accent/15 text-ink" : "text-muted hover:bg-panel-2 hover:text-ink")}
                >
                  {x.q}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-accent/40 bg-panel px-4 py-3 text-sm text-ink">{q.a}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Arranjo Pix — the scheme (rules)">
              <ul className="space-y-1">
                {col("arranjo").map((d) => (
                  <li
                    key={d.id}
                    className={clsx(
                      "rounded-md border px-2 py-1 text-xs transition",
                      on.has(d.id) ? "border-accent bg-accent/10 text-ink" : "border-transparent text-muted",
                      d.id === "res1" && "font-medium",
                    )}
                  >
                    {d.label}
                    {on.has(d.id) && <div className="mt-0.5 text-[11px] text-muted">{d.note}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Infrastructure — systems the BCB operates">
              <ul className="space-y-1">
                {col("infra").map((d) => (
                  <li
                    key={d.id}
                    className={clsx("rounded-md border px-2 py-1 text-xs transition", on.has(d.id) ? "border-[#818cf8] bg-[#818cf8]/10 text-ink" : "border-transparent text-muted")}
                  >
                    {d.label}
                    {on.has(d.id) && <div className="mt-0.5 text-[11px] text-muted">{d.note}</div>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                The BCB plays three roles at once: it <em>owns</em> the arranjo (writes the rules), <em>operates</em> the infrastructure (SPI,
                DICT, STR) and <em>supervises</em> the participants. Note that the technical manuals (Catálogo, ICOM, Segurança) are annexes
                of the Regulamento Pix: an XSD violation is, formally, a breach of the scheme rules.
              </p>
            </Panel>
          </div>
        </div>
      </div>
      <Panel title="How the rulebook moved">
        <div className="overflow-x-auto pb-1">
          <ol className="flex min-w-[900px] items-start gap-0">
            {TIMELINE.map((x, i) => (
              <li key={x.d} className="relative flex-1 px-1">
                <div className="flex items-center">
                  <span className={clsx("size-2.5 shrink-0 rounded-full", i === 1 || x.t.includes("goes live") ? "bg-accent" : "bg-[#818cf8]")} />
                  {i < TIMELINE.length - 1 && <span className="h-px flex-1 bg-line" />}
                </div>
                <div className="mt-1.5 font-mono text-[10px] text-faint">{x.d}</div>
                <div className="text-[11px] leading-snug text-muted">{x.t}</div>
              </li>
            ))}
          </ol>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: click &quot;How does a PSP top up its Conta PI on a Sunday?&quot; — the answer lives on the infrastructure side, in the older STR
        world, and it is why PSP treasuries pre-fund on Fridays even though Pix itself never closes.
      </p>
    </div>
  );
}
