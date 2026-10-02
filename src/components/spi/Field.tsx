"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

export function TextField({
  label,
  value,
  onChange,
  mono = true,
  placeholder,
  hint,
  bad,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  bad?: boolean;
  className?: string;
}) {
  return (
    <label className={clsx("block min-w-0 text-xs", className)}>
      <span className="text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "mt-1 w-full min-w-0 rounded-md border bg-bg px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent",
          mono && "font-mono",
          bad ? "border-bad/70" : "border-line",
        )}
      />
      {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <label className={clsx("block min-w-0 text-xs", className)}>
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 w-full min-w-0 rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={clsx("inline-flex items-center gap-2 text-sm text-muted", disabled && "opacity-50")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-[#32bcad]" />
      {label}
    </label>
  );
}

/** A colored breakdown of a fixed-format identifier, e.g. an EndToEndId. */
export function IdAnatomy({ parts }: { parts: { text: string; label: string; color: string }[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-x-0.5 gap-y-2 font-mono text-[13px]">
      {parts.map((p, i) => (
        <span key={i} className="flex flex-col items-start">
          <span className="rounded px-1 py-0.5 break-all" style={{ background: p.color + "22", color: p.color }}>
            {p.text}
          </span>
          <span className="mt-0.5 px-1 font-sans text-[10px] text-faint">{p.label}</span>
        </span>
      ))}
    </div>
  );
}

export function RuleList({ rules }: { rules: { ok: boolean; text: string; code?: string; who?: string }[] }) {
  return (
    <ul className="space-y-1.5 text-[12.5px] leading-snug">
      {rules.map((r, i) => (
        <li key={i} className={clsx("flex gap-2", r.ok ? "text-muted" : "text-bad")}>
          <span className={clsx("mt-px font-mono", r.ok ? "text-ok" : "text-bad")}>{r.ok ? "✓" : "✗"}</span>
          <span className="min-w-0">
            {r.text}
            {!r.ok && r.code && (
              <span className="ml-1 font-mono text-[11px]">
                → RJCT {r.code}
                {r.who ? ` (${r.who})` : ""}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
