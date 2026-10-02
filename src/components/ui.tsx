"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({
  n,
  title,
  color,
  children,
}: {
  n: string;
  title: string;
  color?: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-8 max-w-3xl animate-rise">
      <div className="mb-2 font-mono text-xs text-accent" style={color ? { color } : undefined}>
        {n}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <div className="mt-3 text-[15px] leading-relaxed text-muted text-pretty">{children}</div>
    </header>
  );
}

/** A section heading inside a chapter page, introducing one visualization. */
export function Section({
  title,
  concepts,
  children,
  intro,
}: {
  title: string;
  /** concept ids this section illustrates, e.g. ["lsm-tree", "sstable"]; rendered as anchor chips */
  concepts?: string[];
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {concepts?.map((p) => (
            <a
              key={p}
              href={`#${p}`}
              className="rounded-md border border-line bg-panel-2 px-1.5 py-px font-mono text-[11px] text-muted hover:border-faint hover:text-ink"
            >
              {p}
            </a>
          ))}
        </div>
        {intro && <div className="mt-2 text-[15px] leading-relaxed text-muted text-pretty">{intro}</div>}
      </div>
      {children}
    </section>
  );
}

export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx("flex min-w-0 flex-col rounded-xl border border-line bg-panel", className)}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
          {right}
        </div>
      )}
      <div className={clsx("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Takeaways({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-8 grid gap-3 md:grid-cols-3">
      {items.map((item, i) => (
        <li key={i} className="rounded-xl border border-line bg-panel/60 p-4 text-sm leading-relaxed text-muted">
          <span className="mb-2 block font-mono text-xs text-accent">takeaway</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Callout for a single idea worth remembering. */
export function Callout({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "bad" | "ok" | "info" }) {
  const color = { accent: "border-accent/50", bad: "border-bad/50", ok: "border-ok/50", info: "border-info/50" }[tone];
  return (
    <div className={clsx("rounded-xl border-l-2 bg-panel/70 px-4 py-3 text-[15px] leading-relaxed text-muted", color)}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "bad" | "warn" | "neutral";
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/60 px-3 py-2">
      <div className="text-[11px] tracking-wide text-faint uppercase">{label}</div>
      <div
        className={clsx(
          "mt-0.5 font-mono text-lg tabular-nums",
          tone === "good" && "text-ok",
          tone === "bad" && "text-bad",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "default",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "ghost";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-black hover:brightness-110",
        variant === "default" && "border border-line bg-panel-2 text-ink hover:border-faint",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  className,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex min-w-0 items-center gap-3 text-sm", className)}>
      <span className="min-w-0 shrink text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-16 flex-1"
      />
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums sm:w-20">{format(value)}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md px-2.5 py-1 font-medium transition",
            value === o.value ? "bg-line text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Controls({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
