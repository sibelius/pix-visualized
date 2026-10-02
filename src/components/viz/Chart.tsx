"use client";

import { useId, useState, type ReactNode } from "react";

export type Series = {
  id: string;
  label: string;
  color: string;
  points: [number, number][];
  dashed?: boolean;
  /** fill the area under the line */
  area?: boolean;
  width?: number;
  /** draw as a step function (for cumulative counts) */
  step?: boolean;
};

export type Marker = { x: number; label?: string; color?: string };
export type HMarker = { y: number; label?: string; color?: string };
export type Dot = { x: number; y: number; color: string; label?: string; r?: number };

export type Scale = { x: (v: number) => number; y: (v: number) => number; width: number; height: number; pad: Pad };
type Pad = { top: number; right: number; bottom: number; left: number };

function ticks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const defaultFmt = (v: number) =>
  Math.abs(v) >= 1e6 ? `${v / 1e6}M` : Math.abs(v) >= 1e3 ? `${v / 1e3}k` : String(Number(v.toPrecision(4)));

/**
 * A small, dependency-free SVG line chart. Responsive by viewBox; hover shows
 * a crosshair with the value of every series at that x.
 */
export function LineChart({
  series,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  markers = [],
  hMarkers = [],
  dots = [],
  height = 260,
  width = 640,
  xFormat = defaultFmt,
  yFormat = defaultFmt,
  legend = true,
  hover = true,
  children,
  bands = [],
}: {
  series: Series[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  markers?: Marker[];
  hMarkers?: HMarker[];
  dots?: Dot[];
  height?: number;
  width?: number;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  legend?: boolean;
  hover?: boolean;
  /** extra SVG drawn on top, given the scales */
  children?: (s: Scale) => ReactNode;
  /** shaded vertical bands */
  bands?: { from: number; to: number; color: string; label?: string }[];
}) {
  const clip = useId();
  const pad: Pad = { top: 14, right: 16, bottom: xLabel ? 40 : 26, left: yLabel ? 58 : 44 };
  const all = series.flatMap((s) => s.points);
  const xd: [number, number] = xDomain ?? [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const yd: [number, number] = yDomain ?? [
    Math.min(0, ...all.map((p) => p[1])),
    Math.max(...all.map((p) => p[1]).filter(Number.isFinite)) * 1.08 || 1,
  ];
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;
  // round to 0.01px so server and client render identical attributes
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const x = (v: number) => r2(pad.left + ((v - xd[0]) / (xd[1] - xd[0] || 1)) * iw);
  const span = yd[1] - yd[0] || 1;
  // clamp far-off-scale values so paths stay finite; the clip path hides the overflow
  const y = (v: number) => r2(pad.top + ih - ((Math.min(Math.max(v, yd[0] - span), yd[1] + 2 * span) - yd[0]) / span) * ih);
  const scale: Scale = { x, y, width, height, pad };

  const [hx, setHx] = useState<number | null>(null);

  const path = (s: Series) => {
    const pts = s.points.filter((p) => Number.isFinite(p[1]));
    if (!pts.length) return "";
    if (s.step) {
      let d = `M${x(pts[0][0])},${y(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) d += `H${x(pts[i][0])}V${y(pts[i][1])}`;
      return d;
    }
    return pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join("");
  };

  const nearest = (s: Series, xv: number) => {
    let best: [number, number] | null = null;
    for (const p of s.points) if (!best || Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p;
    return best;
  };

  return (
    <div className="min-w-0">
      {legend && series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden>
                <line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full select-none"
        onMouseMove={
          hover
            ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const px = ((e.clientX - r.left) / r.width) * width;
                if (px < pad.left || px > width - pad.right) return setHx(null);
                setHx(xd[0] + ((px - pad.left) / iw) * (xd[1] - xd[0]));
              }
            : undefined
        }
        onMouseLeave={() => setHx(null)}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={pad.left} y={pad.top} width={iw} height={ih} />
          </clipPath>
        </defs>
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={x(b.from)} y={pad.top} width={Math.max(0, x(b.to) - x(b.from))} height={ih} fill={b.color} opacity={0.1} />
            {b.label && (
              <text x={(x(b.from) + x(b.to)) / 2} y={pad.top + 12} textAnchor="middle" fontSize={10.5} fill={b.color}>
                {b.label}
              </text>
            )}
          </g>
        ))}
        {ticks(yd[0], yd[1]).map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#242a38" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="#5a6275">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {ticks(xd[0], xd[1], 6).map((t) => (
          <text key={`x${t}`} x={x(t)} y={height - pad.bottom + 15} textAnchor="middle" fontSize={10.5} fill="#5a6275">
            {xFormat(t)}
          </text>
        ))}
        {xLabel && (
          <text x={pad.left + iw / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="#8a93a8">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            transform={`translate(13 ${pad.top + ih / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill="#8a93a8"
          >
            {yLabel}
          </text>
        )}
        <g clipPath={`url(#${clip})`}>
          {series.map((s) =>
            s.area ? (
              <path
                key={`a${s.id}`}
                d={`${path(s)}L${x(s.points.at(-1)?.[0] ?? 0)},${y(yd[0])}L${x(s.points[0]?.[0] ?? 0)},${y(yd[0])}Z`}
                fill={s.color}
                opacity={0.12}
              />
            ) : null,
          )}
          {series.map((s) => (
            <path
              key={s.id}
              d={path(s)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
            />
          ))}
        </g>
        {hMarkers.map((m, i) => (
          <g key={`h${i}`}>
            <line x1={pad.left} x2={width - pad.right} y1={y(m.y)} y2={y(m.y)} stroke={m.color ?? "#8a93a8"} strokeDasharray="3 4" />
            {m.label && (
              <text x={width - pad.right - 4} y={y(m.y) - 5} textAnchor="end" fontSize={10.5} fill={m.color ?? "#8a93a8"}>
                {m.label}
              </text>
            )}
          </g>
        ))}
        {markers.map((m, i) => (
          <g key={`m${i}`}>
            <line x1={x(m.x)} x2={x(m.x)} y1={pad.top} y2={pad.top + ih} stroke={m.color ?? "#8a93a8"} strokeDasharray="3 4" />
            {m.label && (
              <text
                x={x(m.x) + (x(m.x) > width * 0.75 ? -5 : 5)}
                y={pad.top + 12}
                textAnchor={x(m.x) > width * 0.75 ? "end" : "start"}
                fontSize={10.5}
                fill={m.color ?? "#8a93a8"}
              >
                {m.label}
              </text>
            )}
          </g>
        ))}
        {dots.map((d, i) => (
          <g key={`d${i}`}>
            <circle cx={x(d.x)} cy={y(d.y)} r={d.r ?? 4.5} fill={d.color} stroke="#0a0c11" strokeWidth={1.5} />
            {d.label && (
              <text x={x(d.x) + 7} y={y(d.y) - 7} fontSize={10.5} fill={d.color}>
                {d.label}
              </text>
            )}
          </g>
        ))}
        {children?.(scale)}
        {hx !== null && (
          <g pointerEvents="none">
            <line x1={x(hx)} x2={x(hx)} y1={pad.top} y2={pad.top + ih} stroke="#5a6275" />
            {(() => {
              const rows = series
                .map((s) => ({ s, p: nearest(s, hx) }))
                .filter((r): r is { s: Series; p: [number, number] } => !!r.p);
              const bx = x(hx) > width / 2 ? x(hx) - 158 : x(hx) + 8;
              return (
                <g>
                  {rows.map(({ s, p }) => (
                    <circle key={s.id} cx={x(p[0])} cy={y(p[1])} r={3.5} fill={s.color} />
                  ))}
                  <rect x={bx} y={pad.top + 4} width={150} height={20 + rows.length * 15} rx={6} fill="#0a0c11" opacity={0.92} stroke="#242a38" />
                  <text x={bx + 8} y={pad.top + 18} fontSize={10.5} fill="#8a93a8">
                    {xLabel ? `${xLabel}: ` : "x: "}
                    {xFormat(Number(hx.toPrecision(3)))}
                  </text>
                  {rows.map(({ s, p }, i) => (
                    <text key={s.id} x={bx + 8} y={pad.top + 33 + i * 15} fontSize={10.5} fill={s.color}>
                      {s.label.length > 16 ? `${s.label.slice(0, 15)}…` : s.label}: {yFormat(Number(p[1].toPrecision(3)))}
                    </text>
                  ))}
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}

/** Horizontal bar list, handy for comparisons. */
export function Bars({
  rows,
  max,
  format = defaultFmt,
}: {
  rows: { label: ReactNode; value: number; color: string; note?: ReactNode }[];
  max?: number;
  format?: (v: number) => string;
}) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3 text-sm">
          <div className="truncate text-muted">{r.label}</div>
          <div className="h-5 overflow-hidden rounded bg-panel-2">
            <div
              className="h-full rounded transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (r.value / m) * 100))}%`, background: r.color }}
            />
          </div>
          <div className="w-20 text-right font-mono text-xs tabular-nums">
            {format(r.value)}
            {r.note && <div className="text-[10px] text-faint">{r.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
