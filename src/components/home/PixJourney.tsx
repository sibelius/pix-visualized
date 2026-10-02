"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAPTER_COLOR, NAV, type ChapterKey } from "@/components/shell/nav";
import { Button } from "@/components/ui";

type NodeId = "payer" | "pspA" | "dict" | "spi" | "pspB" | "payee" | "contapi";

type MapNode = { id: NodeId; label: string; sub: string; x: number; y: number; color: string };

const NODES: MapNode[] = [
  { id: "payer", label: "Payer", sub: "app · QR / key", x: 90, y: 200, color: CHAPTER_COLOR.qrcode },
  { id: "pspA", label: "Payer PSP", sub: "ISPB 11111111", x: 280, y: 200, color: CHAPTER_COLOR.architecture },
  { id: "dict", label: "DICT", sub: "key directory", x: 280, y: 60, color: CHAPTER_COLOR.dict },
  { id: "spi", label: "SPI", sub: "BCB · settles 24/7", x: 530, y: 200, color: CHAPTER_COLOR.spi },
  { id: "contapi", label: "Conta PI", sub: "balances at BCB", x: 530, y: 340, color: CHAPTER_COLOR.contapi },
  { id: "pspB", label: "Payee PSP", sub: "ISPB 22222222", x: 780, y: 200, color: CHAPTER_COLOR.architecture },
  { id: "payee", label: "Payee", sub: "account credited", x: 970, y: 200, color: CHAPTER_COLOR.api },
];

type Step = {
  from: NodeId;
  to: NodeId;
  title: string;
  msg: string;
  ms: number;
  note: string;
  chapters: ChapterKey[];
};

const STEPS: Step[] = [
  { from: "payer", to: "pspA", title: "Scan the BR Code", msg: "000201…26 br.gov.bcb.pix…6304 CRC", ms: 0, note: "The payer's app parses the EMV TLV string, checks its CRC16 and finds either a key (static QR) or a location URL (dynamic QR, which returns a JWS-signed charge).", chapters: ["qrcode", "api"] },
  { from: "pspA", to: "dict", title: "Look up the key", msg: "GET /entries/{key}", ms: 60, note: "The payer PSP asks DICT who owns the key. DICT returns the account (ISPB, branch, number, type) and owner, plus anti-fraud statistics. Every lookup spends tokens from a rate-limit bucket.", chapters: ["dict"] },
  { from: "dict", to: "pspA", title: "Entry + risk data", msg: "<Entry> ISPB 22222222 · CACC …", ms: 40, note: "The PSP shows a masked name and CPF to the payer to confirm, runs its fraud checks and checks the payer's limits (night, new device).", chapters: ["dict", "med", "beyond"] },
  { from: "pspA", to: "spi", title: "Send pacs.008", msg: "pacs.008 · E11111111…  · R$ 42,00", ms: 30, note: "The payer PSP builds an ISO 20022 credit transfer with a 32-char EndToEndId, signs it with XMLDSig and POSTs it over ICOM on the private RSFN network using mTLS.", chapters: ["spi", "iso", "xmldsig", "icom", "certs"] },
  { from: "spi", to: "contapi", title: "Check & reserve funds", msg: "Conta PI 11111111 ≥ 42,00 ?", ms: 20, note: "The SPI verifies the signature and schema, and checks that the payer PSP's Conta PI at the central bank has enough balance. If it doesn't, the payment is rejected (AM04).", chapters: ["contapi", "xmldsig"] },
  { from: "spi", to: "pspB", title: "Forward pacs.008", msg: "pacs.008 → stream of 22222222", ms: 30, note: "The SPI forwards the message to the payee PSP, which pulls it from its ICOM long-polling stream. The payee PSP now has a few seconds to accept or reject.", chapters: ["spi", "icom"] },
  { from: "pspB", to: "spi", title: "Accept with pacs.002", msg: "pacs.002 · TxSts=ACSP", ms: 400, note: "The payee PSP validates the account and answers with a pacs.002. A rejection carries a reason code (e.g. AC03 invalid account). No answer in time means the SPI rejects it.", chapters: ["spi"] },
  { from: "spi", to: "contapi", title: "Settle gross, in central-bank money", msg: "−42,00 PSP A · +42,00 PSP B", ms: 20, note: "Settlement is final and gross: one Pix, one debit, one credit, in the participants' PI accounts. No netting, no end-of-day batch. It runs 24 hours a day, 365 days a year.", chapters: ["contapi", "architecture"] },
  { from: "spi", to: "pspB", title: "Confirm: ACSC", msg: "pacs.002 · TxSts=ACSC", ms: 20, note: "Both PSPs get the settlement confirmation. The payee PSP must credit the customer's account right away and fire webhooks to the merchant (API Pix /pix callback).", chapters: ["spi", "api"] },
  { from: "pspB", to: "payee", title: "Money is in", msg: "webhook POST {url}/pix", ms: 50, note: "The whole round trip usually finishes in a few seconds. If it has to be undone later, that is a new message, pacs.004 (a devolução, or a MED refund in case of fraud), not a reversal.", chapters: ["returns", "med", "automatico"] },
];

const W = 1060;
const H = 400;
const NW = 150;
const NH = 52;
const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, MapNode>;

function clip(a: MapNode, b: MapNode) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(Math.abs(NW / 2 / (dx || 1e-9)), Math.abs(NH / 2 / (dy || 1e-9))) + 0.01;
  return { x1: a.x + dx * t, y1: a.y + dy * t, x2: b.x - dx * (t + 0.01), y2: b.y - dy * (t + 0.01) };
}

const EDGES: [NodeId, NodeId][] = [
  ["payer", "pspA"],
  ["pspA", "dict"],
  ["pspA", "spi"],
  ["spi", "contapi"],
  ["spi", "pspB"],
  ["pspB", "payee"],
];

export function PixJourney() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = STEPS[i];

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (i >= STEPS.length - 1) setPlaying(false);
      else setI(i + 1);
    }, 1900);
    return () => clearTimeout(id);
  }, [playing, i]);

  const elapsed = STEPS.slice(0, i + 1).reduce((s, x) => s + x.ms, 0);
  const A = byId[step.from];
  const B = byId[step.to];
  const seg = clip(A, B);
  const active = (a: NodeId, b: NodeId) => (step.from === a && step.to === b) || (step.from === b && step.to === a);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => (i >= STEPS.length - 1 ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? "Pause" : i >= STEPS.length - 1 ? "Replay" : "Play"}
          </Button>
          <Button onClick={() => (setPlaying(false), setI(Math.max(0, i - 1)))} disabled={i === 0}>
            ← Prev
          </Button>
          <Button onClick={() => (setPlaying(false), setI(Math.min(STEPS.length - 1, i + 1)))} disabled={i === STEPS.length - 1}>
            Next →
          </Button>
          <div className="ml-auto font-mono text-xs text-muted">
            step {i + 1}/{STEPS.length} · ~{elapsed} ms elapsed (illustrative)
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-bg/40 p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
            <defs>
              <marker id="pj-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#e7e9f0" />
              </marker>
            </defs>
            {/* RSFN boundary: the private network between PSPs and the BCB */}
            <rect x={195} y={120} width={670} height={270} rx={18} fill="none" stroke="#242a38" strokeDasharray="4 6" />
            <text x={210} y={380} fontSize={11} fill="#5a6275" fontFamily="var(--font-mono-jb)">
              RSFN · private network · mTLS + XMLDSig
            </text>
            {EDGES.map(([a, b]) => {
              const s = clip(byId[a], byId[b]);
              const on = active(a, b);
              return (
                <line key={`${a}-${b}`} x1={s.x1.toFixed(1)} y1={s.y1.toFixed(1)} x2={s.x2.toFixed(1)} y2={s.y2.toFixed(1)} stroke={on ? "#3a4256" : "#2a3142"} strokeWidth={1.4} />
              );
            })}
            <line
              key={`active-${i}`}
              x1={seg.x1.toFixed(1)}
              y1={seg.y1.toFixed(1)}
              x2={seg.x2.toFixed(1)}
              y2={seg.y2.toFixed(1)}
              stroke="#e7e9f0"
              strokeWidth={2}
              markerEnd="url(#pj-arr)"
              strokeDasharray="6 5"
              className="pj-flow"
            />
            <circle key={`dot-${i}`} r={6} fill={CHAPTER_COLOR[step.chapters[0]]} className="pj-dot" style={{ offsetPath: `path("M${seg.x1.toFixed(1)} ${seg.y1.toFixed(1)} L${seg.x2.toFixed(1)} ${seg.y2.toFixed(1)}")` }} />
            {NODES.map((n) => {
              const on = n.id === step.from || n.id === step.to;
              return (
                <g key={n.id} transform={`translate(${n.x - NW / 2} ${n.y - NH / 2})`}>
                  <rect width={NW} height={NH} rx={10} fill={on ? "#171b24" : "#11141b"} stroke={on ? n.color : "#242a38"} strokeWidth={on ? 2 : 1} />
                  <rect x={10} y={NH / 2 - 9} width={4} height={18} rx={2} fill={n.color} />
                  <text x={22} y={23} fontSize={14} fontWeight={600} fill="#e7e9f0">
                    {n.label}
                  </text>
                  <text x={22} y={40} fontSize={11} fill="#5a6275">
                    {n.sub}
                  </text>
                </g>
              );
            })}
            <text x={W / 2} y={30} textAnchor="middle" fontSize={13} fill="#e7e9f0" fontFamily="var(--font-mono-jb)">
              {step.msg}
            </text>
          </svg>
          <style>{`.pj-flow{animation:pjdash 1s linear infinite}@keyframes pjdash{to{stroke-dashoffset:-11}}.pj-dot{offset-rotate:0deg;animation:pjmove 1.2s ease-in-out infinite}@keyframes pjmove{from{offset-distance:0%}to{offset-distance:100%}}`}</style>
        </div>
        <div className="mt-3 flex gap-1">
          {STEPS.map((s, k) => (
            <button
              key={k}
              type="button"
              aria-label={s.title}
              onClick={() => (setPlaying(false), setI(k))}
              className="h-1.5 flex-1 rounded-full transition"
              style={{ background: k <= i ? CHAPTER_COLOR[s.chapters[0]] : "#242a38" }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">Try: press Play, or click the progress bar to jump to a hop. Each hop names the chapter that takes it apart.</p>
      </div>
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="font-mono text-[11px] text-faint">
          {byId[step.from].label} → {byId[step.to].label}
        </div>
        <div className="mt-1 text-sm font-semibold">{step.title}</div>
        <p className="mt-2 text-sm leading-relaxed text-ink/90">{step.note}</p>
        <div className="mt-4 text-[11px] tracking-wide text-faint uppercase">Go deeper</div>
        <div className="mt-2 flex flex-col gap-1.5">
          {step.chapters.map((k) => {
            const item = NAV.find((x) => x.chapter === k)!;
            return (
              <Link key={k} href={item.href} className="group flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:border-faint">
                <span className="font-mono text-[11px]" style={{ color: CHAPTER_COLOR[k] }}>
                  {item.n}
                </span>
                <span className="text-muted group-hover:text-ink">{item.label}</span>
                <span className="ml-auto text-faint group-hover:text-ink">→</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
