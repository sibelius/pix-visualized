"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { analyzeKey } from "./keys";
import { sha256Hex } from "./crypto";

const KEYS = [
  { key: "vendas@padariatresirmaos.com.br", pj: true },
  { key: "11222333000181", pj: true },
  { key: "financeiro@acme.com.br", pj: true },
  { key: "+5511987654321", pj: false },
  { key: "12345678909", pj: false },
];
const TTL = 180; // seconds, max Cache-Control for PJ entries (Manual DICT §12)
const DURATION = 15 * 60;

export function CacheSim() {
  const [every, setEvery] = useState(20);
  const [cache, setCache] = useState<"on" | "off">("on");
  const [ttl, setTtl] = useState(TTL);

  const run = useMemo(() => {
    const exp = new Map<string, number>();
    const reqs: { t: number; k: number; hit: boolean }[] = [];
    let i = 0;
    for (let t = 0; t < DURATION; t += every, i++) {
      const k = i % KEYS.length;
      const key = KEYS[k];
      const hit = cache === "on" && key.pj && (exp.get(key.key) ?? -1) > t;
      if (!hit && cache === "on" && key.pj) exp.set(key.key, t + ttl);
      reqs.push({ t, k, hit });
    }
    return reqs;
  }, [every, cache, ttl]);

  const calls = run.filter((r) => !r.hit).length;
  const hits = run.length - calls;
  const x = (t: number) => Math.round(70 + (t / DURATION) * 560);

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={cache}
          onChange={setCache}
          options={[
            { value: "off", label: "no cache" },
            { value: "on", label: "honor Cache-Control" },
          ]}
        />
        <Slider label="a payment every" value={every} min={5} max={120} step={5} onChange={setEvery} format={(v) => `${v} s`} className="min-w-60 flex-1" />
        <Slider label="max-age" value={ttl} min={30} max={180} step={30} onChange={setTtl} format={(v) => `${v} s`} className="min-w-52 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel title="Entry cache: a company paying 5 keys in rotation for 15 min">
          <svg viewBox="0 0 640 150" className="w-full">
            {KEYS.map((k, i) => (
              <g key={k.key}>
                <text x={4} y={22 + i * 24} fontSize={9.5} fill={k.pj ? "#8a93a8" : "#5a6275"}>
                  {k.pj ? "PJ" : "PF"} {k.key.length > 10 ? `${k.key.slice(0, 9)}…` : k.key}
                </text>
                <line x1={70} x2={630} y1={18 + i * 24} y2={18 + i * 24} stroke="#242a38" />
              </g>
            ))}
            {run.map((r, i) => (
              <rect key={i} x={x(r.t) - 2} y={11 + r.k * 24} width={4} height={14} rx={1} fill={r.hit ? "#34d399" : "#22d3ee"} opacity={r.hit ? 0.55 : 1} />
            ))}
            {[0, 5, 10, 15].map((m) => (
              <text key={m} x={x(m * 60)} y={144} fontSize={9.5} textAnchor="middle" fill="#5a6275">
                {m} min
              </text>
            ))}
          </svg>
          <div className="mt-1 flex gap-4 text-xs text-muted">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#22d3ee]" />
              GET /entries (DICT)
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#34d399] opacity-60" />
              served from cache
            </span>
          </div>
          <p className="mt-2 text-xs text-faint">
            Try: pay every 20 s with the cache on: PJ keys are fetched once per max-age window, PF keys always go to the DICT (only entries of
            legal persons may be cached, for at most 180 s). Re-querying a key that is still fresh in cache is itself a scan signal.
          </p>
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3">
          <Stat label="payments" value={run.length} />
          <Stat label="DICT lookups" value={calls} tone={cache === "on" ? "good" : "neutral"} />
          <Stat label="cache hits" value={hits} hint="no tokens spent" />
          <Stat label="saved" value={`${Math.round((hits / run.length) * 100)}%`} />
        </div>
      </div>
      <ExistenceCache />
    </div>
  );
}

function ExistenceCache() {
  const [input, setInput] = useState("+55 11 98765-4321");
  const [hash, setHash] = useState<string>("");
  const [source, setSource] = useState<"lookup" | "check">("lookup");
  const a = analyzeKey(input);
  useEffect(() => {
    let live = true;
    sha256Hex(a.normalized).then((h) => live && setHash(h));
    return () => {
      live = false;
    };
  }, [a.normalized]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Panel title="Key-existence cache (Manual DICT §16)">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 font-mono text-sm text-ink outline-none focus:border-faint"
          />
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: "lookup", label: "from a lookup / claim" },
              { value: "check", label: "from checkKeys" },
            ]}
          />
        </div>
        <table className="mt-3 w-full text-xs">
          <tbody className="font-mono">
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 text-faint">stored: SHA-256(key)</td>
              <td className="break-all text-ok">{hash || "…"}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 text-faint">exists</td>
              <td className="text-ink">true</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 text-faint">cache updated</td>
              <td className="text-ink">2026-10-02T17:37:04Z</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 text-faint">valid until</td>
              <td className="text-ink">{source === "lookup" ? "2026-11-01 (≤ 30 days)" : "per the response Cache-Control"}</td>
            </tr>
            {["the key in clear", "owner name / CPF", "account data"].map((f) => (
              <tr key={f} className="border-t border-line">
                <td className="py-1.5 pr-3 text-faint">{f}</td>
                <td className="text-bad line-through">not allowed</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-faint">
          Hashing is applied to the normalized key ({a.type ?? "?"}: <span className="font-mono">{a.normalized}</span>). Used only internally, e.g. to
          skip lookups that would 404 in a batch payment; it must never back a user-facing &quot;does this key exist?&quot; feature.
        </p>
      </Panel>
      <Panel title="What a direct participant must poll" bodyClassName="p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <tbody>
            {[
              ["listClaims", "≥ once per minute", "new claims, status changes as donor and claimer"],
              ["acknowledge claim / infraction", "≤ 180 s (p95)", "from creation to acknowledge"],
              ["cancel portability / confirm ownership by default", "≤ 60 min after day 7", "DEFAULT_OPERATION"],
              ["createSyncVerification", "every ≤ 36 h per key type", "VSync check"],
              ["listCidSetEvents", "continuous", "incremental CID log, 200 per page"],
              ["listInfractionReports", "periodic", "reports where you are counterparty"],
              ["listEventNotifications", "periodic, 7-day window", "funds-recovery events (cursor paging)"],
            ].map(([a, b, c]) => (
              <tr key={a} className="border-t border-line first:border-t-0">
                <td className="px-4 py-2 font-mono text-ink">{a}</td>
                <td className={clsx("py-2 pr-3 font-mono text-accent")}>{b}</td>
                <td className="py-2 pr-4 text-muted">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="px-4 pb-3 text-[11px] text-faint">Sources: Manual Operacional do DICT v8.5, Manual de Tempos do Pix v7.0. The DICT never pushes: everything is pull.</p>
      </Panel>
    </div>
  );
}
