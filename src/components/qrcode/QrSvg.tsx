"use client";

import { useMemo } from "react";
import { encodeQr, modulesToPath, type QrResult } from "./qr";

export function useQr(text: string, opts?: { minVersion?: number; forceMask?: number }): QrResult | null {
  const mv = opts?.minVersion;
  const fm = opts?.forceMask;
  return useMemo(() => encodeQr(text, { minVersion: mv, forceMask: fm }), [text, mv, fm]);
}

/** Pure SVG QR. Light background, dark modules, 4-module quiet zone. Optional overlay of function patterns. */
export function QrSvg({
  qr,
  className,
  showFunction = false,
  highlight,
}: {
  qr: QrResult | null;
  className?: string;
  showFunction?: boolean;
  /** optionally tint data modules: function returns a colour or null */
  highlight?: (r: number, c: number) => string | null;
}) {
  const path = useMemo(() => (qr ? modulesToPath(qr.modules) : ""), [qr]);
  const fnPath = useMemo(() => {
    if (!qr || !showFunction) return "";
    let d = "";
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.isFunction[r][c]) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return d;
  }, [qr, showFunction]);
  if (!qr) {
    return (
      <div className={className}>
        <div className="flex aspect-square items-center justify-center rounded-lg border border-bad/50 text-center text-xs text-bad">too long for v20-M</div>
      </div>
    );
  }
  const dim = qr.size + 8;
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} className={className} shapeRendering="crispEdges" role="img" aria-label={`QR code version ${qr.version}`}>
      <rect width={dim} height={dim} fill="#f4f5f8" rx={1} />
      <path d={path} fill="#0a0c11" />
      {highlight &&
        qr.modules.flatMap((row, r) =>
          row.map((_, c) => {
            const col = highlight(r, c);
            return col ? <rect key={`${r}-${c}`} x={c + 4} y={r + 4} width={1} height={1} fill={col} opacity={0.55} /> : null;
          }),
        )}
      {showFunction && <path d={fnPath} fill="#2dd4bf" opacity={0.45} />}
    </svg>
  );
}
