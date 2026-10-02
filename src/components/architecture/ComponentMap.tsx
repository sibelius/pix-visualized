"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Panel } from "@/components/ui";

type NodeId = "payer" | "payee" | "psp1" | "psp2" | "icom" | "spi" | "contapi" | "dict" | "str" | "spiweb" | "itp" | "apipix";

type Node = {
  id: NodeId;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  bcb?: boolean;
  what: string;
  run: string;
  wire: string;
  docs: string;
  href?: string;
};

const NODES: Node[] = [
  { id: "payer", label: "Payer", sub: "app / QR scan", x: 70, y: 40, w: 110, what: "The paying end user (usuário pagador). Starts a Pix by key, QR code, manual data, NFC or through an initiator.", run: "—", wire: "reads a BR Code (EMV TLV, CRC16)", docs: "Manual de Padrões para Iniciação do Pix", href: "/qrcode" },
  { id: "payee", label: "Payee", sub: "merchant / person", x: 690, y: 40, w: 110, what: "The receiving end user (usuário recebedor). A business typically creates charges through the API Pix and prints dynamic QR codes.", run: "—", wire: "API Pix (JSON) at its PSP", docs: "API Pix (bacen.github.io/pix-api)", href: "/api-pix" },
  { id: "psp1", label: "Payer PSP", sub: "ISPB 12345678", x: 150, y: 140, w: 130, what: "The account provider of the payer: holds the customer's account, looks up the key, holds the funds, builds and signs the pacs.008.", run: "a bank, cooperative or payment institution", wire: "ISO 20022 to ICOM, REST/XML to DICT", docs: "Regulamento Pix; Manual de Fluxos", href: "/pacs008" },
  { id: "psp2", label: "Payee PSP", sub: "ISPB 87654321", x: 610, y: 140, w: 130, what: "The account provider of the payee: validates the destination account, answers pacs.002, credits the customer, fires webhooks.", run: "a bank, cooperative or payment institution", wire: "ISO 20022 via ICOM, API Pix to its merchants", docs: "Regulamento Pix; Manual de Tempos (authorization SLA)", href: "/pacs008" },
  { id: "itp", label: "Initiator (ITP)", sub: "Open Finance", x: 60, y: 250, w: 110, what: "A payment initiation service provider: it asks the payer's account provider to send a Pix on the payer's behalf (formaDeIniciacao INIC), with consent.", run: "an authorized institution", wire: "Open Finance APIs (FAPI, JSON) — not the SPI", docs: "Open Finance Brasil; Res. BCB nº 80/2021" },
  { id: "apipix", label: "API Pix", sub: "cob · cobv · webhook", x: 700, y: 250, w: 110, what: "The standard REST API every PSP exposes to its business customers to create charges (cob/cobv), dynamic QR locations, refunds and webhooks.", run: "each PSP (BCB publishes the spec)", wire: "HTTPS + OAuth2 + mTLS, JSON; QR payloads as JWS", docs: "API Pix v2.10.0", href: "/api-pix" },
  { id: "icom", label: "ICOM", sub: "icom.pi.rsfn.net.br", x: 290, y: 262, w: 120, bcb: true, what: "The SPI's communication interface: the only door into the SPI. PSPs POST signed messages and pull theirs with long-polling. PSPs never expose HTTP servers to the SPI.", run: "BCB", wire: "HTTP/1.1, TLS 1.2 mTLS (ICP-Brasil cert), XML UTF-8, gzip; primary and secondary channels", docs: "Manual das Interfaces de Comunicação v1.12", href: "/icom" },
  { id: "dict", label: "DICT", sub: "dict.pi.rsfn.net.br", x: 470, y: 262, w: 120, bcb: true, what: "The directory of Pix keys (chaves): maps a key to ISPB, branch, account, type and owner. Also claims, portability, infraction reports, MED 2.0 fund recovery, anti-scan rate limiting.", run: "BCB", wire: "REST over HTTPS + mTLS, signed XML bodies (its own schemas, not ISO 20022)", docs: "Manual Operacional do DICT; DICT API v2", href: "/dict" },
  { id: "spi", label: "SPI", sub: "settlement engine", x: 290, y: 322, w: 120, bcb: true, what: "Sistema de Pagamentos Instantâneos: the BCB's real-time gross settlement system, 24/7/365. Validates each order, blocks funds, asks the receiver, settles, notifies.", run: "BCB", wire: "ISO 20022 (pacs/camt/pain/reda/admi) per Catálogo Vol. VI", docs: "Res. BCB nº 195/2022 (Regulamento do SPI)", href: "/pacs008" },
  { id: "contapi", label: "Conta PI", sub: "one per direct", x: 295, y: 386, w: 110, bcb: true, what: "Conta Pagamentos Instantâneos: each direct participant's account at the BCB, where Pix settles in central bank money. No overdraft: the balance is never negative. End-of-day balances up to a cap are remunerated at the Selic rate.", run: "BCB (inside the SPI)", wire: "camt.060 → camt.052/053/054 queries", docs: "Res. BCB nº 195/2022", href: "/conta-pi" },
  { id: "str", label: "STR", sub: "reserves RTGS", x: 470, y: 386, w: 120, bcb: true, what: "Sistema de Transferência de Reservas, the BCB's older RTGS for reserves (TED, interbank). Liquidity moves between reserves and the Conta PI here, only on business days (06:30–18:30, plus an aporte-only window).", run: "BCB", wire: "SPB proprietary XML (LPI0001…LPI0008), UTF-16 BE, MQ over RSFN", docs: "Catálogo de Serviços do SFN, Vols. I–IV", href: "/conta-pi" },
  { id: "spiweb", label: "SPI-Web", sub: "operator console", x: 475, y: 322, w: 110, bcb: true, what: "BCB web module for participants: Conta PI balance and entries, manual block/unblock with dual control, operational minimum balance, and the mandatory ICOM IP allowlist (since 23/07/2026).", run: "BCB", wire: "browser over RSFN", docs: "Informes SPI 2026" },
];

type Edge = { a: NodeId; b: NodeId; label: string; color: string };
const EDGES: Edge[] = [
  { a: "payer", b: "psp1", label: "app", color: "#5a6275" },
  { a: "psp2", b: "payee", label: "notify / webhook", color: "#5a6275" },
  { a: "payee", b: "apipix", label: "create cob", color: "#a3e635" },
  { a: "apipix", b: "psp2", label: "", color: "#a3e635" },
  { a: "psp1", b: "dict", label: "GET /entries", color: "#22d3ee" },
  { a: "psp1", b: "icom", label: "pacs.008", color: "#818cf8" },
  { a: "psp2", b: "icom", label: "pacs.002", color: "#818cf8" },
  { a: "icom", b: "spi", label: "", color: "#818cf8" },
  { a: "spi", b: "contapi", label: "debit/credit", color: "#e879f9" },
  { a: "str", b: "contapi", label: "LPI aporte/retirada", color: "#f5a524" },
  { a: "itp", b: "psp1", label: "Open Finance", color: "#f472b6" },
  { a: "spiweb", b: "spi", label: "", color: "#5a6275" },
  { a: "psp2", b: "dict", label: "register keys", color: "#22d3ee" },
];

const H = 30;
const center = (n: Node) => ({ cx: n.x + n.w / 2, cy: n.y + H / 2 });

export function ComponentMap() {
  const [sel, setSel] = useState<NodeId>("spi");
  const n = NODES.find((x) => x.id === sel)!;
  const linked = new Set(EDGES.filter((e) => e.a === sel || e.b === sel).flatMap((e) => [e.a, e.b]));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="The pieces, and what flows between them" bodyClassName="p-2 sm:p-3">
        <svg viewBox="0 0 830 430" className="w-full">
          <rect x={130} y={235} width={610} height={188} rx={14} fill="#0e1118" stroke="#242a38" strokeDasharray="5 4" />
          <text x={145} y={252} fontSize={10.5} fill="#5a6275" letterSpacing={1}>
            RSFN · Rede do Sistema Financeiro Nacional (private network, BCB systems below)
          </text>
          {EDGES.map((e, i) => {
            const A = center(NODES.find((x) => x.id === e.a)!);
            const B = center(NODES.find((x) => x.id === e.b)!);
            const on = e.a === sel || e.b === sel;
            return (
              <g key={i} opacity={on ? 1 : 0.3}>
                <line x1={A.cx} y1={A.cy} x2={B.cx} y2={B.cy} stroke={e.color} strokeWidth={on ? 2 : 1.2} />
                {e.label && on && (
                  <text x={(A.cx + B.cx) / 2} y={(A.cy + B.cy) / 2 - 5} fontSize={10} textAnchor="middle" fill={e.color} fontFamily="ui-monospace,monospace" stroke="#11141b" strokeWidth={3} paintOrder="stroke">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {NODES.map((x) => {
            const on = x.id === sel;
            const near = linked.has(x.id);
            return (
              <g key={x.id} onClick={() => setSel(x.id)} className="cursor-pointer" opacity={on || near ? 1 : 0.7}>
                <rect x={x.x} y={x.y} width={x.w} height={H} rx={7} fill={on ? "#1d2030" : "#171b24"} stroke={on ? "#32bcad" : x.bcb ? "#818cf8" : "#242a38"} strokeWidth={on ? 2 : 1} />
                <text x={x.x + x.w / 2} y={x.y + 13} textAnchor="middle" fontSize={11.5} fill="#e7e9f0">
                  {x.label}
                </text>
                <text x={x.x + x.w / 2} y={x.y + 25} textAnchor="middle" fontSize={8.5} fill="#8a93a8" fontFamily="ui-monospace,monospace">
                  {x.sub}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="px-2 text-xs text-faint">
          Try: click DICT, then STR — the two BCB systems a PSP talks to that are <em>not</em> ISO 20022. Click Conta PI to see that only the
          SPI and the STR ever touch it.
        </p>
      </Panel>
      <Panel title={n.label} right={n.bcb ? <span className="rounded bg-[#818cf8]/15 px-1.5 py-0.5 text-[10px] text-[#a5b4fc]">operated by BCB</span> : undefined}>
        <p className="text-sm leading-relaxed text-ink/90">{n.what}</p>
        <dl className="mt-3 space-y-2 text-xs">
          {(
            [
              ["runs it", n.run],
              ["on the wire", n.wire],
              ["rulebook", n.docs],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-faint">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        {n.href && (
          <Link href={n.href} className={clsx("mt-3 inline-block text-xs text-accent hover:underline")}>
            Go deeper →
          </Link>
        )}
      </Panel>
    </div>
  );
}
