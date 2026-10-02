"use client";

import { useState } from "react";
import { Controls, Panel } from "@/components/ui";
import { AREAS, CATALOG } from "./catalogData";
import { SKELETONS } from "./skeletons";

type Part = { text: string; label: string; color: string; note: string };
type Decoded = { kind: string; parts: Part[]; notes: string[] } | { kind: "error"; parts: []; notes: string[] };

const C = { area: "#818cf8", num: "#32bcad", variant: "#22d3ee", ver: "#f5a524", sub: "#f472b6", sep: "#5a6275" };

function msgInfo(area: string, num: string) {
  const id = `${area}.${num}`;
  const cat = CATALOG.find((c) => c.id === id);
  const sk = SKELETONS[id];
  return { id, cat, sk };
}

const sep = (t = "."): Part => ({ text: t, label: "", color: C.sep, note: "" });

export function decode(raw: string): Decoded {
  const s = raw.trim();
  let m: RegExpExecArray | null;

  // SPI namespace: https://www.bcb.gov.br/pi/pacs.008/1.16
  if ((m = /^https:\/\/www\.bcb\.gov\.br\/pi\/([a-z]{4})\.(\d{3})\/(\d+)\.(\d+)$/.exec(s))) {
    const [, area, num, maj, min] = m;
    const { cat, sk } = msgInfo(area, num);
    return {
      kind: "SPI XML namespace (Envelope xmlns)",
      parts: [
        { text: "https://www.bcb.gov.br/pi/", label: "BCB Pix namespace root", color: C.sep, note: "" },
        { text: area, label: "business area", color: C.area, note: AREAS[area] ?? "unknown area" },
        sep(),
        { text: num, label: "message", color: C.num, note: cat?.name ?? "not in the SPI catalog" },
        sep("/"),
        { text: `${maj}.${min}`, label: "SPI version", color: C.ver, note: sk && sk.spi === `${maj}.${min}` ? "current in catalog v5.13" : sk ? `catalog v5.13 has ${sk.spi}` : "" },
      ],
      notes: [
        "The namespace on <Envelope> must match the XSD you validate against: a pacs.008 1.15 envelope will not validate against the 1.16 schema.",
        sk ? `This SPI version wraps ISO ${sk.iso} (AppHdr: head.001.001.01).` : "",
      ].filter(Boolean),
    };
  }
  // SPI definition / file name: pacs.008.spi.1.16[.xsd]
  if ((m = /^([a-z]{4})\.(\d{3})\.(spi)\.(\d+)\.(\d+)(\.xsd)?$/.exec(s))) {
    const [, area, num, sub, maj, min, xsd] = m;
    const { cat, sk } = msgInfo(area, num);
    return {
      kind: xsd ? "SPI XSD file name (gggg.nnn.sss.j.i.xsd)" : "SPI message definition (AppHdr/MsgDefIdr)",
      parts: [
        { text: area, label: "gggg · ISO group", color: C.area, note: AREAS[area] ?? "unknown" },
        sep(),
        { text: num, label: "nnn · ISO message", color: C.num, note: cat?.name ?? "not in the SPI catalog" },
        sep(),
        { text: sub, label: "sss · subsystem", color: C.sub, note: "the Pix subsystem that handles it (spi)" },
        sep(),
        { text: maj, label: "j · major", color: C.ver, note: "SPI major version" },
        sep(),
        { text: min, label: "i · minor", color: C.ver, note: "SPI minor version" },
        ...(xsd ? [{ text: xsd, label: "extension", color: C.sep, note: "" }] : []),
      ],
      notes: [
        sk ? `Catalog v5.13 ships ${area}.${num}.spi.${sk.spi}.xsd, built on ISO ${sk.iso}.` : "Not part of the SPI catalog v5.13.",
        "The SPI version is the BCB's restriction of the message. It moves independently of the ISO version and of the catalog version (5.13).",
      ],
    };
  }
  // ISO id: pacs.008.001.09
  if ((m = /^([a-z]{4})\.(\d{3})\.(\d{3})\.(\d{2})$/.exec(s))) {
    const [, area, num, variant, ver] = m;
    const { cat, sk } = msgInfo(area, num);
    return {
      kind: "ISO 20022 message identifier",
      parts: [
        { text: area, label: "business area", color: C.area, note: AREAS[area] ?? "unknown" },
        sep(),
        { text: num, label: "message id", color: C.num, note: cat?.name ?? "(not used by the SPI)" },
        sep(),
        { text: variant, label: "variant", color: C.variant, note: variant === "001" ? "001 = the global, unrestricted variant" : "a restricted variant" },
        sep(),
        { text: ver, label: "version", color: C.ver, note: `version ${Number(ver)} of the message definition` },
      ],
      notes: [
        area === "head"
          ? "head.001 is the Business Application Header: every SPI message embeds version 001.01 of it as <AppHdr>, so it has no XSD of its own in the catalog."
          : sk && sk.iso === s
            ? `This is exactly the base the SPI uses (${area}.${num}.spi.${sk.spi}).`
            : sk
              ? `The SPI is on ISO ${sk.iso}, not ${s}.`
              : "The SPI catalog v5.13 does not use this message.",
        "In practice nearly every message in use is variant 001; schemes such as SWIFT CBPR+ or the SPI publish their own restricted XSDs and usage rules on top of it.",
      ],
    };
  }
  // ISO namespace urn
  if ((m = /^urn:iso:std:iso:20022:tech:xsd:([a-z]{4})\.(\d{3})\.(\d{3})\.(\d{2})$/.exec(s))) {
    const inner = decode(`${m[1]}.${m[2]}.${m[3]}.${m[4]}`);
    return {
      kind: "ISO 20022 namespace (standard XSD)",
      parts: [{ text: "urn:iso:std:iso:20022:tech:xsd:", label: "ISO namespace prefix", color: C.sep, note: "" }, ...inner.parts] as Part[],
      notes: ["The SPI does not use ISO namespaces: its Document lives under the bcb.gov.br/pi/… namespace of the Envelope.", ...inner.notes],
    };
  }
  // proprietary STR / SPB
  if ((m = /^(STR|LDL|LTR|SEL|CIR|GEN|PAG|SLB|CTP|BMA|RDC)(\d{4})(R\d)?$/.exec(s.toUpperCase()))) {
    return {
      kind: "SPB proprietary message code (pre-ISO)",
      parts: [
        { text: m[1], label: "service / group", color: C.area, note: m[1] === "STR" ? "STR: the BCB's RTGS (Sistema de Transferência de Reservas)" : "an SPB service group" },
        { text: m[2], label: "event number", color: C.num, note: m[1] === "STR" && m[2] === "0008" ? "STR0008: client-to-client transfer (TED)" : "event in that group" },
        ...(m[3] ? [{ text: m[3], label: "response", color: C.ver, note: `${m[3]}: a response leg (R1 to the sender, R2 to the receiver…)` }] : []),
      ],
      notes: ["Flat code namespace from the Catálogo de Mensagens e de Arquivos do SFN (volumes I–II); see the last section of this chapter."],
    };
  }
  return { kind: "error", parts: [], notes: ["Not recognized. Try pacs.008.001.09, pacs.008.spi.1.16, a bcb.gov.br/pi namespace, or STR0008."] };
}

const EXAMPLES = [
  "pacs.008.spi.1.16",
  "pacs.008.001.09",
  "https://www.bcb.gov.br/pi/pacs.002/1.17",
  "pain.013.spi.2.2.xsd",
  "urn:iso:std:iso:20022:tech:xsd:camt.054.001.08",
  "pacs.028.001.03",
  "head.001.001.01",
  "pibr.001.spi.1.3",
  "STR0008R2",
];

export function NameDecoder() {
  const [v, setV] = useState(EXAMPLES[0]);
  const d = decode(v);
  return (
    <div className="space-y-4">
      <Controls>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setV(x)}
              className="rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-ink"
            >
              {x.length > 28 ? x.slice(0, 26) + "…" : x}
            </button>
          ))}
        </div>
      </Controls>
      <Panel title={d.kind === "error" ? "Unrecognized" : d.kind}>
        {d.parts.length > 0 && (
          <div className="flex flex-wrap items-start gap-y-4 pb-2">
            {d.parts.map((p, i) => (
              <div key={i} className="flex min-w-0 flex-col">
                <span className="break-all font-mono text-lg sm:text-2xl" style={{ color: p.color }}>
                  {p.text}
                </span>
                {p.label && (
                  <span className="mt-1 max-w-40 pr-2 text-[11px] leading-snug">
                    <span style={{ color: p.color }}>{p.label}</span>
                    {p.note && <span className="block text-faint">{p.note}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {d.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </Panel>
      <p className="text-xs text-faint">
        Try: decode pacs.008.spi.1.16, then pacs.008.001.09 — the same message seen from the BCB&apos;s and from ISO&apos;s side. Then
        pacs.028 (the ISO status request): the SPI simply does not have it; status is recovered by resending (idempotency) or with camt.060 →
        camt.054.
      </p>
    </div>
  );
}
