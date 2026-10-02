"use client";

import { useMemo, useState } from "react";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { buildBrCode, EXAMPLES } from "./brcode";
import { b64urlDecodeText, BCB_SAMPLE_JWS } from "./jwsSample";
import { byteCapacity, encodeQr, MAX_VERSION, sizeOf } from "./qr";
import { QrSvg } from "./QrSvg";

type Preset = "static" | "dynamic" | "json" | "jws";

const LONG_DESC = "Mensalidade outubro turma B aluno 4471 escola";

function staticCode(descLen: number) {
  return buildBrCode({
    kind: "static",
    key: "123e4567-e12b-12d1-a456-426655440000",
    infoAdicional: LONG_DESC.slice(0, descLen),
    fss: "",
    url: "",
    recUrl: "",
    amount: "1250.00",
    name: "ESCOLA MUNDO NOVO LTDA",
    city: "BELO HORIZONTE",
    cep: "30140071",
    txid: "MENS2026OUT4471B",
    unique: false,
  }).code;
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "dynamic", label: "dynamic (URL)" },
  { value: "static", label: "static (all inline)" },
  { value: "json", label: "inline the JSON?" },
  { value: "jws", label: "inline the signed JWS?" },
];

export function QrAnatomy() {
  const [preset, setPreset] = useState<Preset>("dynamic");
  const [descLen, setDescLen] = useState(37);
  const [overlay, setOverlay] = useState<"plain" | "function" | "codewords">("codewords");

  const text = useMemo(() => {
    if (preset === "dynamic") return EXAMPLES[1].code;
    if (preset === "static") return staticCode(descLen);
    if (preset === "json") return b64urlDecodeText(BCB_SAMPLE_JWS.split(".")[1]);
    return BCB_SAMPLE_JWS;
  }, [preset, descLen]);

  const qr = useMemo(() => encodeQr(text), [text]);
  const all = useMemo(
    () => ({
      dynamic: encodeQr(EXAMPLES[1].code),
      static: encodeQr(staticCode(descLen)),
      json: encodeQr(b64urlDecodeText(BCB_SAMPLE_JWS.split(".")[1])),
    }),
    [descLen],
  );
  const bytes = new TextEncoder().encode(text).length;

  const highlight =
    overlay === "codewords" && qr
      ? (r: number, c: number) => {
          const i = qr.cwIndex[r][c];
          if (i < 0) return null;
          return i < qr.totalData ? "#38bdf8" : "#f472b6";
        }
      : undefined;

  // capacity step chart
  const W = 520;
  const H = 170;
  const maxB = byteCapacity(MAX_VERSION);
  const x = (b: number) => Math.round((40 + (b / maxB) * (W - 60)) * 10) / 10;
  const y = (m: number) => Math.round((H - 24 - ((m - 21) / (sizeOf(MAX_VERSION) - 21)) * (H - 44)) * 10) / 10;
  let step = `M${x(0)} ${y(21)}`;
  for (let v = 1; v <= MAX_VERSION; v++) {
    step += ` H${x(byteCapacity(v))}`;
    if (v < MAX_VERSION) step += ` V${y(sizeOf(v + 1))}`;
  }
  const dots: { label: string; b: number; m: number | null; col: string }[] = [
    { label: "dynamic", b: new TextEncoder().encode(EXAMPLES[1].code).length, m: all.dynamic?.size ?? null, col: "#2dd4bf" },
    { label: "static", b: new TextEncoder().encode(staticCode(descLen)).length, m: all.static?.size ?? null, col: "#fbbf24" },
    { label: "JSON", b: new TextEncoder().encode(b64urlDecodeText(BCB_SAMPLE_JWS.split(".")[1])).length, m: all.json?.size ?? null, col: "#f472b6" },
  ];

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented value={preset} onChange={setPreset} options={PRESETS} />
        {preset === "static" && <Slider label="infoAdicional chars" value={descLen} min={0} max={37} onChange={setDescLen} className="min-w-52 flex-1" />}
        <span className="inline-flex items-center gap-2 text-muted">
          overlay
          <Segmented
            value={overlay}
            onChange={setOverlay}
            options={[
              { value: "plain", label: "plain" },
              { value: "function", label: "function patterns" },
              { value: "codewords", label: "data vs EC" },
            ]}
          />
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel title={qr ? `Version ${qr.version} · ${qr.size}×${qr.size} modules · ECC M · mask ${qr.mask}` : "Does not fit"}>
          <div className="mx-auto max-w-[360px]">
            <QrSvg qr={qr} className="w-full" showFunction={overlay === "function"} highlight={highlight} />
          </div>
          {overlay === "codewords" && qr && (
            <div className="mt-2 flex flex-wrap justify-center gap-4 text-[11px] text-muted">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#38bdf8]" /> data codewords ({qr.totalData})
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#f472b6]" /> Reed–Solomon EC ({qr.finalCodewords.length - qr.totalData})
              </span>
            </div>
          )}
          <p className="mt-2 font-mono text-[11px] leading-relaxed break-all text-faint">{text.length > 240 ? text.slice(0, 240) + "…" : text}</p>
        </Panel>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="payload" value={`${bytes} B`} hint="UTF-8, byte mode" />
            <Stat label="capacity" value={qr ? `${qr.capacity} B` : "—"} hint={qr ? `${Math.round((bytes / qr.capacity) * 100)}% used` : `> ${maxB} B at v${MAX_VERSION}`} tone={qr ? "neutral" : "bad"} />
            <Stat label="modules" value={qr ? `${qr.size}²` : "—"} hint={qr ? `${qr.size * qr.size} total` : ""} />
            <Stat
              label="RS blocks"
              value={qr ? qr.blocks.length : "—"}
              hint={qr ? `${Array.from(new Set(qr.blocks.map((b) => b.data.length))).join("/")} data + ${qr.ecPerBlock} EC each` : ""}
            />
            <Stat label="mask chosen" value={qr ? qr.mask : "—"} hint="lowest penalty" />
            <Stat label="damage tolerance" value="~15%" hint="level M" />
          </div>
          {qr && (
            <Panel title="Mask penalty (N1 runs + N2 blocks + N3 finder-like + N4 balance)">
              <div className="grid grid-cols-8 items-end gap-1.5" style={{ height: 80 }}>
                {qr.penalties.map((p, m) => {
                  const mx = Math.max(...qr.penalties);
                  const mn = Math.min(...qr.penalties);
                  const h = 16 + ((p - mn) / Math.max(1, mx - mn)) * 56;
                  return (
                    <div key={m} className="flex flex-col items-center justify-end">
                      <div className={m === qr.mask ? "w-full rounded-t bg-accent" : "w-full rounded-t bg-line"} style={{ height: h }} />
                      <div className="mt-1 font-mono text-[10px] text-faint">{m}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 font-mono text-[10px] text-faint">{qr.penalties.join(" · ")}</div>
            </Panel>
          )}
          <Panel title="Bytes → module grid (byte mode, level M)">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              {[21, 41, 61, 81, 97].map((m) => (
                <g key={m}>
                  <line x1={40} x2={W - 20} y1={y(m)} y2={y(m)} stroke="#242a38" />
                  <text x={34} y={y(m) + 3} fontSize={9} textAnchor="end" fill="#5a6275">
                    {m}
                  </text>
                </g>
              ))}
              {[0, 200, 400, 600].map((b) => (
                <text key={b} x={x(b)} y={H - 8} fontSize={9} textAnchor="middle" fill="#5a6275">
                  {b} B
                </text>
              ))}
              <path d={step} fill="none" stroke="#8a93a8" strokeWidth={1.5} />
              {dots.map((d) =>
                d.m ? (
                  <g key={d.label}>
                    <circle cx={x(d.b)} cy={y(d.m)} r={4.5} fill={d.col} />
                    <text x={x(d.b)} y={y(d.m) - 8} fontSize={10} textAnchor="middle" fill={d.col}>
                      {d.label}
                    </text>
                  </g>
                ) : null,
              )}
            </svg>
            <p className="text-[11px] text-faint">The signed JWS ({new TextEncoder().encode(BCB_SAMPLE_JWS).length} B) is off the chart: it would need a version above 20.</p>
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: compare &quot;dynamic&quot; with &quot;inline the JSON?&quot; — the same charge as a 77-character URL keeps the QR small and easy to scan from a phone screen;
        inlining the payload (and its signature) would make it dense, fragile, and impossible to change after printing.
      </p>
    </div>
  );
}
