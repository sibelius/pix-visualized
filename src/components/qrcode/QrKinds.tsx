"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui";
import { buildBrCode } from "./brcode";
import { KINDS } from "./kinds";
import { QrSvg, useQr } from "./QrSvg";
import { TlvString } from "./Tlv";

const GROUPS: { id: "static" | "dynamic" | "composite"; label: string; color: string }[] = [
  { id: "static", label: "static — data in the image", color: "#fbbf24" },
  { id: "dynamic", label: "dynamic — URL to a signed payload", color: "#2dd4bf" },
  { id: "composite", label: "composite — + recurrence URL (Pix Automático)", color: "#34d399" },
];

function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v), 2);
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-bg/50 p-3 font-mono text-[11.5px] leading-relaxed text-muted">
      {text.split("\n").map((line, i) => {
        const m = line.match(/^(\s*)"([^"]+)":(.*)$/);
        return (
          <div key={i}>
            {m ? (
              <>
                {m[1]}
                <span className="text-info">&quot;{m[2]}&quot;</span>:<span className="text-ink">{m[3]}</span>
              </>
            ) : (
              line
            )}
          </div>
        );
      })}
    </pre>
  );
}

export function QrKinds() {
  const [id, setId] = useState("dyn-cob");
  const [hover, setHover] = useState<string | null>(null);
  const k = KINDS.find((x) => x.id === id) ?? KINDS[0];
  const built = useMemo(() => buildBrCode(k.input), [k]);
  const qr = useQr(built.code);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="mb-2 text-[11px] font-semibold tracking-wide uppercase" style={{ color: g.color }}>
              {g.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.filter((x) => x.group === g.id).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setId(x.id)}
                  className={clsx(
                    "rounded-md border px-2 py-1 text-xs transition",
                    x.id === id ? "border-transparent bg-line text-ink" : "border-line text-muted hover:text-ink",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Panel title={k.product}>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div>
              <QrSvg qr={qr} className="w-full" />
              <div className="mt-1 text-center font-mono text-[10px] text-faint">
                v{qr?.version} · {built.code.length} chars
              </div>
            </div>
            <TlvString nodes={built.spans} hover={hover} setHover={setHover} className="text-[12px] leading-5" />
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted">
            {k.notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={k.fetches.length ? "What the payer's PSP fetches" : "Nothing to fetch"}>
          {k.fetches.length === 0 ? (
            <div className="text-sm leading-relaxed text-muted">
              <p>The payer&apos;s app parses the string, checks the CRC, then asks DICT who owns the key:</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-bg/50 p-3 font-mono text-[11.5px] text-ink">
                GET /api/v2/entries/{k.input.key} → account, owner name, CPF/CNPJ
              </pre>
              <p className="mt-3">
                The name shown on the confirmation screen comes from DICT, not from 59. The receiver&apos;s PSP learns about this payment only when the pacs.008 arrives
                through the SPI.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {k.fetches.map((f, i) => (
                <div key={i}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs text-ink">{f.label}</span>
                    <span className="font-mono text-[10px] text-faint">Accept: application/jose</span>
                  </div>
                  <div className="mb-1.5 font-mono text-[11px] break-all text-accent">{f.request}</div>
                  <Json value={f.json} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: flip between &quot;Dynamic Pix Saque&quot; and &quot;Dynamic Pix Troco&quot; — the QR is byte-for-byte identical; everything that differs lives in the
        signed payload behind the URL.
      </p>
    </div>
  );
}
