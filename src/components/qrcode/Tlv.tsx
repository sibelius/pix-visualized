"use client";

import clsx from "clsx";

/** Minimal shape shared by builder spans and parser fields. */
export type TlvNode = {
  path: string;
  id: string;
  len?: string;
  lenStr?: string;
  value: string;
  children?: TlvNode[];
  issues?: { level: "error" | "warn" }[];
};

export const FIELD_COLOR: Record<string, string> = {
  "00": "#8a93a8",
  "01": "#a78bfa",
  "26": "#2dd4bf",
  "52": "#64748b",
  "53": "#94a3b8",
  "54": "#fbbf24",
  "58": "#94a3b8",
  "59": "#f472b6",
  "60": "#fb923c",
  "61": "#fdba74",
  "62": "#38bdf8",
  "63": "#f87171",
  "80": "#34d399",
};

export function colorFor(path: string): string {
  const root = path.split(".")[0];
  const n = Number(root);
  if (FIELD_COLOR[root]) return FIELD_COLOR[root];
  if (n >= 26 && n <= 51) return FIELD_COLOR["26"];
  if (n >= 80) return FIELD_COLOR["80"];
  return "#8a93a8";
}

function Seg({ n, hover, setHover }: { n: TlvNode; hover: string | null; setHover: (p: string | null) => void }) {
  const c = colorFor(n.path);
  const active = hover === n.path || (hover !== null && hover.startsWith(n.path + "."));
  const bad = n.issues?.some((i) => i.level === "error");
  return (
    <span
      onMouseEnter={(e) => {
        e.stopPropagation();
        setHover(n.path);
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        setHover(null);
      }}
      className={clsx("rounded-[3px] transition-colors", active && "bg-white/10", bad && "underline decoration-bad decoration-wavy underline-offset-4")}
    >
      <span style={{ color: c }} className="font-bold">
        {n.id}
      </span>
      <span style={{ color: c, opacity: 0.55 }}>{n.len ?? n.lenStr}</span>
      {n.children && n.children.length ? (
        n.children.map((ch) => <Seg key={ch.path} n={ch} hover={hover} setHover={setHover} />)
      ) : (
        <span style={{ color: c, opacity: 0.9 }}>{n.value}</span>
      )}
    </span>
  );
}

/** Renders a BR Code with each TLV coloured: ID bold, length dimmed, value. Nested templates recurse. */
export function TlvString({
  nodes,
  hover,
  setHover,
  tail,
  className,
}: {
  nodes: TlvNode[];
  hover: string | null;
  setHover: (p: string | null) => void;
  tail?: string;
  className?: string;
}) {
  return (
    <div className={clsx("font-mono text-[13px] leading-6 break-all", className)}>
      {nodes.map((n) => (
        <Seg key={n.path} n={n} hover={hover} setHover={setHover} />
      ))}
      {tail && <span className="text-bad">{tail}</span>}
    </div>
  );
}
