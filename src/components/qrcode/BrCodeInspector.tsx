"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { EXAMPLES, parseBrCode, type ParsedField } from "./brcode";
import { colorFor, TlvString } from "./Tlv";

function Tree({ f, hover, setHover }: { f: ParsedField; hover: string | null; setHover: (p: string | null) => void }) {
  const errs = f.issues.filter((i) => i.level === "error").length;
  const warns = f.issues.filter((i) => i.level === "warn").length;
  return (
    <li>
      <div
        onMouseEnter={() => setHover(f.path)}
        onMouseLeave={() => setHover(null)}
        className={clsx("flex min-w-0 items-baseline gap-2 rounded px-1.5 py-0.5", hover === f.path && "bg-white/5")}
      >
        <span className="shrink-0 font-mono text-xs font-semibold" style={{ color: colorFor(f.path) }}>
          {f.id}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-faint">{f.lenStr}</span>
        <span className="shrink-0 text-xs text-muted">{f.info?.name ?? "?"}</span>
        {!f.children && <span className="min-w-0 truncate font-mono text-xs text-ink">{f.value}</span>}
        {errs > 0 && <span className="shrink-0 rounded bg-bad/15 px-1 text-[10px] text-bad">{errs} error</span>}
        {warns > 0 && <span className="shrink-0 rounded bg-warn/15 px-1 text-[10px] text-warn">{warns} warn</span>}
      </div>
      {f.children && f.children.length > 0 && (
        <ul className="ml-4 border-l border-line pl-2">
          {f.children.map((c) => (
            <Tree key={c.path + c.start} f={c} hover={hover} setHover={setHover} />
          ))}
        </ul>
      )}
    </li>
  );
}

function findField(fields: ParsedField[], path: string): ParsedField | undefined {
  for (const f of fields) {
    if (f.path === path) return f;
    if (f.children) {
      const x = findField(f.children, path);
      if (x) return x;
    }
  }
  return undefined;
}

export function BrCodeInspector() {
  const [text, setText] = useState(EXAMPLES[1].code);
  const [hover, setHover] = useState<string | null>(null);
  const res = useMemo(() => parseBrCode(text.trim()), [text]);
  const consumed = res.fields.length ? res.fields[res.fields.length - 1].end : 0;
  const tail = text.trim().slice(consumed);
  const hov = hover ? findField(res.fields, hover) : undefined;
  const errors = res.issues.filter((i) => i.level === "error");
  const warns = res.issues.filter((i) => i.level === "warn");

  return (
    <div className="space-y-4">
      <Controls>
        {EXAMPLES.map((e) => (
          <Button key={e.label} variant={text === e.code ? "primary" : "default"} onClick={() => setText(e.code)} className="text-xs">
            {e.label}
          </Button>
        ))}
      </Controls>
      <Panel title="Paste any Pix Copia e Cola">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={3}
          className="w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-faint"
        />
        <div className="mt-3 rounded-lg border border-line bg-bg/40 px-3 py-2">
          <TlvString nodes={res.fields} hover={hover} setHover={setHover} tail={tail} />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Parsed tree (recursive TLV)">
          <ul className="space-y-0.5">
            {res.fields.map((f) => (
              <Tree key={f.path + f.start} f={f} hover={hover} setHover={setHover} />
            ))}
          </ul>
          <div className="mt-3 min-h-[3.25rem] rounded-lg border border-line bg-panel-2/60 px-3 py-2 text-xs leading-relaxed text-muted">
            {hov ? (
              <>
                <span className="font-mono font-semibold" style={{ color: colorFor(hov.path) }}>
                  {hov.path}
                </span>{" "}
                <span className="text-ink">{hov.info?.name}</span>{" "}
                <span className="font-mono text-faint">
                  offset {hov.start}, declared len {hov.lenStr}, actual {hov.value.length}
                </span>
                <div>{hov.info?.desc}</div>
                {hov.issues.map((i, k) => (
                  <div key={k} className={i.level === "error" ? "text-bad" : "text-warn"}>
                    {i.msg}
                  </div>
                ))}
              </>
            ) : (
              <span className="text-faint">Hover a node or a span of the string.</span>
            )}
          </div>
        </Panel>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="verdict" value={res.ok ? "valid" : "invalid"} tone={res.ok ? "good" : "bad"} hint={`${errors.length} errors · ${warns.length} warnings`} />
            <Stat label="kind" value={res.kind} hint={res.kind === "dynamic" ? "26-25 URL" : res.kind === "static" ? "26-01 key" : res.kind === "composite" ? "80-25 rec URL" : ""} />
            <Stat label="CRC in string" value={res.crcGiven ?? "—"} tone={res.crcGiven && res.crcGiven === res.crcComputed ? "good" : "bad"} />
            <Stat label="CRC computed" value={res.crcComputed ?? "—"} />
          </div>
          <Panel title="Findings">
            {res.issues.length === 0 ? (
              <p className="text-sm text-ok">No problems. Order, lengths, mandatory fields, GUI, txid charset and CRC all check out.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {res.issues.map((i, k) => (
                  <li key={k} onMouseEnter={() => setHover(i.path)} onMouseLeave={() => setHover(null)} className="flex gap-2">
                    <span className={clsx("shrink-0 rounded px-1 font-mono text-[10px]", i.level === "error" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn")}>{i.path}</span>
                    <span className="text-muted">{i.msg}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: load &quot;Broken&quot; and find the URL stuffed into the key field, the 30-character name, the hyphenated txid and the bad CRC. Then edit one length digit of a
        valid code and watch the parser lose framing for everything after it.
      </p>
    </div>
  );
}
