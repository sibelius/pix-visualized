"use client";

import clsx from "clsx";

export type SeqEvent = {
  from: number;
  to: number;
  label: string;
  sub?: string;
  tone?: "ok" | "bad" | "warn" | "info" | "muted";
  /** left gutter label, e.g. "+1.23 s" */
  time?: string;
};

const TONE: Record<string, string> = {
  ok: "#34d399",
  bad: "#f87171",
  warn: "#fbbf24",
  info: "#60a5fa",
  muted: "#8a93a8",
};

/**
 * A UML-style sequence diagram: vertical lifelines, one row per event.
 * Events beyond `shown` are drawn ghosted so the reader sees what is still to come.
 */
export function SequenceDiagram({
  lanes,
  events,
  shown,
  active,
  color = "#a78bfa",
  minWidth = 640,
}: {
  lanes: { label: string; sub?: string }[];
  events: SeqEvent[];
  shown: number;
  active?: number;
  color?: string;
  minWidth?: number;
}) {
  const W = 760;
  const gutter = 64;
  const top = 46;
  const row = 36;
  const H = top + events.length * row + 16;
  const lx = (i: number) => Math.round(gutter + 58 + ((W - gutter - 120) / (lanes.length - 1)) * i);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth }} role="img" aria-label="sequence diagram">
        {lanes.map((l, i) => (
          <g key={i}>
            <rect x={lx(i) - 58} y={4} width={116} height={32} rx={7} fill="#171b24" stroke={i === 2 && lanes.length === 5 ? color : "#242a38"} />
            <text x={lx(i)} y={l.sub ? 18 : 24} textAnchor="middle" fontSize={11.5} fill="#e7e9f0" fontWeight={600}>
              {l.label}
            </text>
            {l.sub && (
              <text x={lx(i)} y={30} textAnchor="middle" fontSize={9.5} fill="#8a93a8">
                {l.sub}
              </text>
            )}
            <line x1={lx(i)} x2={lx(i)} y1={36} y2={H - 6} stroke="#242a38" strokeDasharray="3 4" />
          </g>
        ))}
        {events.map((e, k) => {
          const y = top + k * row + 14;
          const vis = k < shown;
          const c = TONE[e.tone ?? "info"] ?? color;
          const op = vis ? 1 : 0.13;
          const x1 = lx(e.from);
          const x2 = lx(e.to);
          const self = e.from === e.to;
          const isActive = active === k;
          return (
            <g key={k} opacity={op} className={clsx(isActive && "animate-pulse")}>
              {isActive && <rect x={0} y={y - 16} width={W} height={row} fill={c} opacity={0.07} />}
              {e.time && (
                <text x={6} y={y + 4} fontSize={10} fill="#5a6275" fontFamily="var(--font-mono)">
                  {e.time}
                </text>
              )}
              {self ? (
                <>
                  <rect x={x1 - 5} y={y - 9} width={10} height={18} rx={2} fill={c} opacity={0.35} />
                  <text x={x1 + (e.from >= lanes.length - 2 ? -12 : 12)} y={y - 1} fontSize={10.5} fill={c} textAnchor={e.from >= lanes.length - 2 ? "end" : "start"}>
                    {e.label}
                  </text>
                  {e.sub && (
                    <text x={x1 + (e.from >= lanes.length - 2 ? -12 : 12)} y={y + 11} fontSize={9.5} fill="#8a93a8" textAnchor={e.from >= lanes.length - 2 ? "end" : "start"}>
                      {e.sub}
                    </text>
                  )}
                </>
              ) : (
                <>
                  <line x1={x1} x2={x2 + (x2 > x1 ? -6 : 6)} y1={y + 4} y2={y + 4} stroke={c} strokeWidth={1.6} />
                  <path d={x2 > x1 ? `M${x2} ${y + 4} l-7 -4 v8 z` : `M${x2} ${y + 4} l7 -4 v8 z`} fill={c} />
                  <text x={(x1 + x2) / 2} y={y - 2} fontSize={10.5} fill={c} textAnchor="middle" fontFamily="var(--font-mono)">
                    {e.label}
                  </text>
                  {e.sub && (
                    <text x={(x1 + x2) / 2} y={y + 16} fontSize={9.5} fill="#8a93a8" textAnchor="middle">
                      {e.sub}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
