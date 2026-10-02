"use client";

import { useState } from "react";
import clsx from "clsx";
import { Panel, Segmented } from "@/components/ui";

type Ver = { v: string; when?: string; head: string; items: string[] };
// Paraphrased from github.com/bacen/pix-api changelog.md (2.10.0 released Aug 2026).
const VERSIONS: Ver[] = [
  { v: "2.0.0", head: "v2 baseline", items: ["cob, pix, devolução, webhook — the v2 path fragment", "txid as the reconciliation key; problem+json not yet standardised"] },
  { v: "2.1.x", head: "cobv, lotes, locations", items: ["Charges with due date get their own /cobv endpoints", "Batches of cobv: /lotecobv", "POST /cob: PSP-generated txid", "/loc endpoints: reuse a location (printed dynamic QR)", "Webhooks are now tied to a Pix key: PUT /webhook/{chave}"] },
  { v: "2.2.x", head: "standard errors", items: ["RFC 7807 errors with type https://pix.bcb.gov.br/api/v2/error/<Tipo> and violacoes", "PATCH /lotecobv/{id}", "Pix.txid regex {26,35} → {1,35} in /pix and webhooks (static QRs)", "loc / lote ids become int64", "REMOVIDO_* → REMOVIDA_* in the enum"] },
  { v: "2.3.0", head: "editable amounts", items: ["valor.modalidadeAlteracao (1 = payer may change the amount)", "v2 fragment no longer mandatory in the location", "Webhook also fires when a devolução reaches DEVOLVIDO / NAO_REALIZADO"] },
  { v: "2.5.0", head: "Pix Saque / Troco", items: ["valor.retirada.saque | troco with modalidadeAlteracao, modalidadeAgente, prestadorDoServicoDeSaque", "componentesValor on received Pix", "devolução natureza (ORIGINAL / RETIRADA)"] },
  { v: "2.6.x", head: "copy-and-paste", items: ["pixCopiaECola returned on charges (max 512)", "componentesValor details juros/multa/desconto/abatimento for cobv", "devolução descricao (goes to pacs.004 RmtInf)", "descontos allowed up to and including the due date", "MED natures BE08 / FR01 on devoluções"] },
  { v: "2.7.0", head: "Pix Automático", items: ["New tags: Rec, SolicRec, CobR, RecPayload, PayloadLocationRec, WebhookRec, WebhookCobR", "rec.dadosQR with pixCopiaECola + jornada", "cobr uses devedor / recebedor / valor.original like the other charges"] },
  { v: "2.8.x", head: "recurrence polish", items: ["rec.recebedor.convenio and the convenio filter", "cobr.tentativas.rejeicao", "Description limits of 400 chars on rejeição/cancelamento"] },
  { v: "2.9.0", head: "alphanumeric CNPJ", items: ["CNPJ fields accept [0-9A-Z]{14} (IN RFB 2229/2024)", "ISPB-derived fields (ispbParticipante, prestadorDoServicoDeSaque, idRec, idSolicRec) become alphanumeric"] },
  { v: "2.10.0", when: "Aug 2026", head: "current", items: ["GET /pix gains finalidadeMED filter", "encerramento.rejeicao.motivo on solicitações; AP15 rejection code", "PCFD / ERSL cancellation codes deprecated; AGPSS deprecated in favour of AGFSS", "CEP examples fixed to 8 digits"] },
];

const TAGS = ["Cob", "CobV", "LoteCobV", "Pix", "PayloadLocation", "PayloadLocationRec", "CobPayload", "Webhook", "WebhookRec", "WebhookCobR", "Rec", "CobR", "SolicRec", "RecPayload"];
type Prod = "imediato" | "vencimento" | "saque" | "automatico";
// Manual de Padrões v2.10.0, Anexo I §5.4.1. Value = footnote ("" = required, no note).
const MATRIX: Record<Prod, Record<string, string>> = {
  imediato: { Cob: "", Pix: "", PayloadLocation: "", CobPayload: "", Webhook: "" },
  vencimento: { CobV: "", LoteCobV: "", Pix: "", PayloadLocation: "", CobPayload: "", Webhook: "" },
  saque: { Cob: "", Pix: "", PayloadLocation: "", CobPayload: "", Webhook: "" },
  automatico: {
    Cob: "Jornada 3 only",
    CobV: "Jornada 4 only",
    Pix: "",
    PayloadLocation: "Jornadas 3 and 4",
    PayloadLocationRec: "Jornadas 2, 3, 4",
    CobPayload: "Jornadas 3 and 4",
    Webhook: "Jornada 3 only",
    WebhookRec: "",
    WebhookCobR: "",
    Rec: "",
    CobR: "",
    SolicRec: "Jornada 1 only",
    RecPayload: "Jornadas 2, 3, 4",
  },
};

export function Versions() {
  const [sel, setSel] = useState(VERSIONS.length - 1);
  const [prod, setProd] = useState<Prod>("automatico");
  const v = VERSIONS[sel];
  return (
    <div className="space-y-4">
      <Panel title="API Pix 2.x — click a release">
        <svg viewBox="0 0 600 64" className="w-full">
          <line x1={20} x2={580} y1={30} y2={30} stroke="#242a38" strokeWidth={2} />
          {VERSIONS.map((x, i) => {
            const cx = Math.round(20 + (i / (VERSIONS.length - 1)) * 560);
            const on = i === sel;
            return (
              <g key={x.v} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
                <circle cx={cx} cy={30} r={on ? 8 : 5.5} fill={on ? "#a3e635" : x.v === "2.7.0" ? "#34d399" : "#171b24"} stroke={on ? "#a3e635" : "#8a93a8"} />
                <text x={cx} y={i % 2 ? 56 : 14} fontSize={10} textAnchor="middle" fill={on ? "#e7e9f0" : "#8a93a8"} fontFamily="var(--font-mono, monospace)">
                  {x.v}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="mt-2">
          <div className="text-sm text-ink">
            <span className="font-mono text-accent">{v.v}</span> · {v.head}
            {v.when && <span className="text-faint"> · {v.when}</span>}
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {v.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">SemVer: only the major (v2) is in the URL. New resources, optional params, response fields and enum values are &quot;compatible&quot; — clients must tolerate them.</p>
        </div>
      </Panel>
      <Panel
        title="Which tags a PSP must implement, per product"
        right={
          <Segmented
            value={prod}
            onChange={setProd}
            options={[
              { value: "imediato", label: "Cobrança imediata" },
              { value: "vencimento", label: "com vencimento" },
              { value: "saque", label: "Saque/Troco" },
              { value: "automatico", label: "Pix Automático" },
            ]}
          />
        }
      >
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
          {TAGS.map((t) => {
            const note = MATRIX[prod][t];
            const on = note !== undefined;
            return (
              <div key={t} className={clsx("rounded-md border px-2 py-1.5 text-xs", on ? "border-[#a3e635]/60 bg-[#a3e635]/10 text-ink" : "border-line text-faint")}>
                <div className="font-mono break-all">{t}</div>
                <div className="text-[10.5px] text-muted">{on ? note || "required" : "—"}</div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-faint">Source: Manual de Padrões para Iniciação do Pix v2.10.0, Anexo I §5.4.1. Static QR codes are not created through the API at all.</p>
      </Panel>
      <p className="text-xs text-faint">Try: click 2.7.0, then pick Pix Automático in the matrix — almost every tag is involved, but most only for a given authorization journey.</p>
    </div>
  );
}
