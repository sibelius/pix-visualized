"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

export const brl = (x: number) =>
  "R$" + x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A tiny XML highlighter: tags in indigo, attribute names muted, text content ink. Lines starting with "<!--" are comments. */
export function XmlBlock({ xml, className, highlight }: { xml: string; className?: string; highlight?: (line: string) => boolean }) {
  const lines = xml.split("\n");
  return (
    <pre
      className={clsx(
        "max-h-[420px] overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed",
        className,
      )}
    >
      {lines.map((ln, i) => (
        <div key={i} className={clsx("whitespace-pre", highlight?.(ln) && "bg-accent/10")}>
          {colorize(ln)}
        </div>
      ))}
    </pre>
  );
}

function colorize(line: string): ReactNode {
  if (line.trim().startsWith("<!--")) return <span className="text-faint">{line}</span>;
  const parts: ReactNode[] = [];
  const re = /(<\/?[A-Za-z0-9:_.]+)([^>]*?)(\/?>)|([^<]+)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m[4] !== undefined) {
      parts.push(
        <span key={k++} className="text-ink">
          {m[4]}
        </span>,
      );
    } else {
      parts.push(
        <span key={k++} className="text-[#818cf8]">
          {m[1]}
        </span>,
      );
      if (m[2])
        parts.push(
          <span key={k++} className="text-muted">
            {m[2]}
          </span>,
        );
      parts.push(
        <span key={k++} className="text-[#818cf8]">
          {m[3]}
        </span>,
      );
    }
  }
  return parts;
}

export function Check({ ok, children, warn }: { ok: boolean; warn?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2 text-[13px] leading-snug">
      <span className={clsx("mt-0.5 shrink-0 font-mono text-xs", ok ? (warn ? "text-warn" : "text-ok") : "text-bad")}>
        {ok ? (warn ? "!" : "✓") : "✗"}
      </span>
      <span className="min-w-0 text-muted">{children}</span>
    </li>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-faint">Try: {children}</p>;
}

export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  className,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  className?: string;
}) {
  return (
    <label className={clsx("inline-flex items-center gap-2 text-sm text-muted", className)}>
      {label}
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-24 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink"
      />
    </label>
  );
}
