"use client";

import { useState } from "react";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";
import { HOSTS } from "./model";

type Msg = "pacs.008" | "pacs.002" | "pacs.004" | "pain.013" | "trck.002" | "pibr.001" | "admi.002" | "camt.060";
type Prio = "PAGPRI" | "PAGFRD" | "PAGAGD";

const MSGS: { value: Msg; label: string }[] = [
  { value: "pacs.008", label: "pacs.008" },
  { value: "pacs.002", label: "pacs.002" },
  { value: "pacs.004", label: "pacs.004" },
  { value: "pain.013", label: "pain.013/014" },
  { value: "trck.002", label: "trck.002" },
  { value: "pibr.001", label: "pibr.001" },
  { value: "admi.002", label: "admi.002" },
  { value: "camt.060", label: "camt.060 & others" },
];

function route(m: Msg, prio: Prio, origin: "CPM" | "CSM"): { ch: "CPM" | "CSM"; why: string } {
  switch (m) {
    case "pacs.008":
      return prio === "PAGAGD" ? { ch: "CSM", why: "SvcLvl/Prtry = PAGAGD (scheduled) goes on the secondary channel." } : { ch: "CPM", why: `${prio} expects settlement within seconds: primary channel.` };
    case "pacs.002":
      return { ch: origin, why: "Follows the channel of the pacs.008 that started the cycle: the initiating pacs.008 fixes the channel for every message after it." };
    case "pacs.004":
      return { ch: "CPM", why: "A devolução is always on the primary channel, and so are its pacs.002s." };
    case "pain.013":
      return { ch: "CSM", why: "Pix Automático instructions (pain.013) and their answers (pain.014) are secondary only." };
    case "trck.002":
      return { ch: "CSM", why: "MED 2.0 reports of off-SPI (book) transfers and their camt.025 receipts are secondary only, with their own bucket." };
    case "pibr.001":
      return { ch: origin, why: "Either channel, so you can test both; the pibr.002 comes back on the channel you used." };
    case "admi.002":
      return { ch: origin, why: "Always on the channel of the message it rejects." };
    default:
      return { ch: "CPM", why: "Every message the catalogue does not list for the secondary channel travels on the primary channel only." };
  }
}

export function Channels() {
  const [m, setM] = useState<Msg>("pacs.008");
  const [prio, setPrio] = useState<Prio>("PAGAGD");
  const [origin, setOrigin] = useState<"CPM" | "CSM">("CSM");
  const r = route(m, prio, origin);
  const sec = r.ch === "CSM";
  const h = sec ? HOSTS.secondary : HOSTS.primary;
  const showOrigin = m === "pacs.002" || m === "pibr.001" || m === "admi.002";
  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex flex-wrap items-center gap-2 text-muted">
          message
          <Segmented value={m} onChange={setM} options={MSGS} />
        </span>
        {m === "pacs.008" && (
          <span className="inline-flex items-center gap-2 text-muted">
            tipoPrioridadePagamento
            <Segmented value={prio} onChange={setPrio} options={[{ value: "PAGPRI", label: "PAGPRI" }, { value: "PAGFRD", label: "PAGFRD" }, { value: "PAGAGD", label: "PAGAGD" }]} />
          </span>
        )}
        {showOrigin && (
          <span className="inline-flex items-center gap-2 text-muted">
            {m === "pacs.002" ? "initiating pacs.008 went on" : "original/request went on"}
            <Segmented value={origin} onChange={setOrigin} options={[{ value: "CPM", label: "primary" }, { value: "CSM", label: "secondary" }]} />
          </span>
        )}
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title={sec ? "Canal secundário (CSM)" : "Canal primário (CPM)"} right={<span className={`font-mono text-xs ${sec ? "text-info" : "text-accent"}`}>{r.ch}</span>}>
          <p className="text-sm leading-relaxed text-muted">{r.why}</p>
          <div className="mt-3 space-y-1 font-mono text-[12px] text-ink/90">
            <div>
              prod: https://{h.host}:{h.port}
            </div>
            <div className="text-muted">
              homolog: https://{h.hom}:{h.homPort}
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="gzip on POST" value={sec ? "mandatory" : "recommended"} tone={sec ? "warn" : "neutral"} />
          <Stat label="token bucket" value={sec ? (m === "trck.002" ? "1,500 · +500/s" : "350·+35 / 5,000·+350") : "3,750 · +750/s"} hint={sec && m !== "trck.002" ? "08:00–23:59 / 00:00–07:59 BRT" : ""} />
          <Stat label="ops per pacs.008/002" value={sec ? "≤ 500" : "≤ 10"} hint="× 10 messages per request" />
          <Stat label="settle within" value={sec ? "45 min" : "40 s"} hint={sec ? "SPI ≤ 15 min of it" : "from the payer's confirmation"} />
          <Stat label="read cadence (advice)" value={sec ? "≤ 3 s" : "≤ 200 ms"} hint="max gap between GETs" />
          <Stat label="reader threads" value="≤ 6" hint="per participant, per channel" />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: a scheduled pacs.008 (PAGAGD) goes on the secondary channel, and its pacs.002s must follow it there. A pacs.004 returning that same payment goes on the
        primary channel. The two channels are separate HTTP hosts, with separate buckets and separate reader streams.
      </p>
    </div>
  );
}
