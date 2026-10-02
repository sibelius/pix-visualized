"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";
import { CATALOG, GROUPS, LIVE_512, type CatalogEntry } from "./catalogData";
import { SKELETONS } from "./skeletons";

function SkeletonLine({ line }: { line: string }) {
  const ind = line.length - line.trimStart().length;
  const m = /^(\S+)(?: (\[[^\]]+\]))?(?: (.*))?$/.exec(line.trim());
  if (!m) return <div>{line}</div>;
  const [, tag, mult, rest] = m;
  const optional = mult?.startsWith("[0");
  return (
    <div className="whitespace-pre" style={{ paddingLeft: ind * 7 }}>
      <span className={clsx(tag.startsWith("@") ? "text-muted" : tag.startsWith("(") ? "text-faint" : "text-[#a5b4fc]")}>{tag}</span>
      {mult && <span className={clsx("ml-1.5", optional ? "text-warn/80" : "text-faint")}>{mult}</span>}
      {rest && (
        <span className="ml-1.5 text-muted">
          {rest.split(/(\{[^}]*\}|\/[^ ]*\/)/).map((p, i) =>
            p.startsWith("{") || p.startsWith("/") ? (
              <span key={i} className="text-ok/90">
                {p}
              </span>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </span>
      )}
    </div>
  );
}

const PARTY_X = { PSP: 60, SPI: 230, GRAF: 380 } as const;

function Flow({ e }: { e: CatalogEntry }) {
  const pairs: [string, string][] = [];
  e.from.forEach((f) => e.to.forEach((t) => f !== t && !pairs.some(([a, b]) => a === f && b === t) && pairs.push([f, t])));
  const parties = ["PSP", "SPI", ...(e.from.includes("GRAF") || e.to.includes("GRAF") ? ["GRAF"] : [])] as (keyof typeof PARTY_X)[];
  return (
    <svg viewBox="0 0 440 90" className="w-full">
      <defs>
        <marker id="cat-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#818cf8" />
        </marker>
      </defs>
      {parties.map((p) => (
        <g key={p}>
          <rect x={PARTY_X[p] - 42} y={30} width={84} height={30} rx={8} fill="#171b24" stroke="#242a38" />
          <text x={PARTY_X[p]} y={50} textAnchor="middle" fontSize={12} fill="#e7e9f0" fontFamily="ui-monospace,monospace">
            {p === "PSP" && e.from.includes("PSP") && e.to.includes("PSP") ? "PSP A / B" : p}
          </text>
        </g>
      ))}
      {pairs.map(([f, t], i) => {
        const x1 = PARTY_X[f as keyof typeof PARTY_X];
        const x2 = PARTY_X[t as keyof typeof PARTY_X];
        const up = x1 < x2;
        const y = up ? 22 : 70;
        return (
          <path
            key={i}
            d={`M${x1 + (up ? 20 : -20)},${up ? 30 : 60} Q${(x1 + x2) / 2},${up ? 2 : 88} ${x2 + (up ? -20 : 20)},${up ? 30 : 60}`}
            fill="none"
            stroke="#818cf8"
            strokeWidth={1.5}
            markerEnd="url(#cat-arrow)"
            data-y={y}
          />
        );
      })}
    </svg>
  );
}

export function Catalog() {
  const [group, setGroup] = useState<string>("all");
  const [sel, setSel] = useState("pacs.008");
  const rows = CATALOG.filter((c) => group === "all" || c.group === group);
  const e = CATALOG.find((c) => c.id === sel) ?? CATALOG[0];
  const sk = SKELETONS[e.id];

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={group}
          onChange={setGroup}
          options={[{ value: "all", label: `All ${CATALOG.length}` }, ...GROUPS.map((g) => ({ value: g, label: g }))]}
        />
      </Controls>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="SPI message catalog · v5.13" bodyClassName="p-0">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-panel text-[11px] text-faint">
                <tr>
                  <th className="px-3 py-2 font-normal">message</th>
                  <th className="px-2 py-2 font-normal">flow</th>
                  <th className="hidden px-2 py-2 font-normal sm:table-cell">channel</th>
                  <th className="px-2 py-2 font-normal">version</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = SKELETONS[c.id];
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSel(c.id)}
                      className={clsx("cursor-pointer border-t border-line", c.id === sel ? "bg-[#818cf8]/15" : "hover:bg-panel-2")}
                    >
                      <td className="px-3 py-1.5">
                        <div className="font-mono text-ink">{c.id}</div>
                        <div className="text-[10.5px] text-faint">{c.name}</div>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px] text-muted">
                        {c.from.length > 1 ? "PSP ⇄ SPI ⇄ PSP" : `${c.from[0]} → ${c.to[0]}`}
                      </td>
                      <td className="hidden px-2 py-1.5 font-mono text-[11px] sm:table-cell">
                        <span className={clsx(c.channel === "CSM" ? "text-warn" : c.channel === "both" ? "text-info" : "text-muted")}>{c.channel}</span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px] text-muted">{s ? `spi.${s.spi}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="min-w-0 space-y-3">
          <Panel
            title={`${e.id} · ${e.name}`}
            right={
              <Link href={e.chapter.href} className="text-xs text-accent hover:underline">
                {e.chapter.label} →
              </Link>
            }
          >
            <p className="text-sm leading-relaxed text-muted">{e.purpose}</p>
            <Flow e={e} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                label="SPI version (5.13)"
                value={sk ? sk.spi : "—"}
                tone={LIVE_512[e.id] ? "warn" : "neutral"}
                hint={LIVE_512[e.id] ? `live today: ${LIVE_512[e.id]} (5.12) until 25 Oct 2026` : sk ? `${e.id}.spi.${sk.spi}.xsd` : ""}
              />
              <Stat label="ISO base" value={<span className="text-sm">{sk?.iso ?? "—"}</span>} hint={sk?.iso.split(".").length === 4 ? "area.msg.variant.version" : "not in the ISO catalog"} />
              <Stat label="channel" value={e.channel} tone={e.channel === "CSM" ? "warn" : "neutral"} hint={e.channel === "both" ? "CPM or CSM" : e.channel === "CPM" ? "primary only" : "secondary only"} />
            </div>
            {(e.key || e.channelNote) && (
              <div className="mt-3 space-y-1 text-xs text-muted">
                {e.key && (
                  <div>
                    <span className="text-faint">idempotency key: </span>
                    <span className="font-mono text-ink">{e.key}</span>
                  </div>
                )}
                {e.channelNote && (
                  <div>
                    <span className="text-faint">channel rule: </span>
                    {e.channelNote}
                  </div>
                )}
              </div>
            )}
          </Panel>
          {sk && (
            <Panel title={`Document skeleton · ${sk.root}`} right={<span className="font-mono text-[11px] text-faint">{sk.lines.length < sk.total ? `${sk.lines.length} of ${sk.total} nodes` : `${sk.total} nodes`}</span>}>
              <div className="max-h-[340px] overflow-auto font-mono text-[11px] leading-[1.6]">
                {sk.lines.map((l, i) => (
                  <SkeletonLine key={i} line={l} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: filter &quot;Pix Automático &amp; scheduling&quot; and open pain.013 — it is SPI version 2.2 of an ISO 001.10 message, and the only
        family besides camt.025/trck.002 forced onto the secondary channel. Then open pibr.001: no ISO version at all — the echo test is a BCB
        invention wearing ISO clothing. Skeletons are read straight from the v5.13.1 XSDs (orange multiplicities are optional).
      </p>
    </div>
  );
}
