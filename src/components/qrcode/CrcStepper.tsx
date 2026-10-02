"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { crc16, crcTrace, EXAMPLES, hex4, parseBrCode } from "./brcode";

const STEP_BYTES = 16;
const bin16 = (n: number) => n.toString(2).padStart(16, "0");
const bin8 = (n: number) => n.toString(2).padStart(8, "0");
const POLY = 0x1021;

function Register({ value, label, highlight }: { value: number; label: string; highlight?: "msb" | "poly" }) {
  const bits = bin16(value).split("");
  const poly = bin16(POLY).split("");
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-faint">
        <span>{label}</span>
        <span className="font-mono text-muted">0x{hex4(value)}</span>
      </div>
      <div className="grid grid-cols-16 gap-px" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {bits.map((b, i) => (
          <div
            key={i}
            className={clsx(
              "flex aspect-square items-center justify-center rounded-[3px] font-mono text-[10px] sm:text-xs",
              b === "1" ? "bg-accent/80 text-black" : "bg-panel-2 text-faint",
              highlight === "msb" && i === 0 && "ring-2 ring-warn",
              highlight === "poly" && poly[i] === "1" && "ring-1 ring-info",
            )}
          >
            {b}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CrcStepper() {
  const [mode, setMode] = useState<"step" | "corrupt">("step");
  const base = EXAMPLES[0].code;
  const payload = base.slice(0, base.length - 4); // includes "6304"
  const trace = useMemo(() => crcTrace(payload, STEP_BYTES), [payload]);
  const totalSteps = trace.length * 9; // per byte: 1 XOR-in + 8 bit steps
  const [step, setStep] = useState(0);
  const t = useTicker(() => setStep((s) => (s + 1 >= totalSteps ? s : s + 1)), { speed: 0.12 });
  const { running, pause } = t;
  useEffect(() => {
    if (running && step >= totalSteps - 1) pause();
  }, [running, pause, step, totalSteps]);

  const bi = Math.min(trace.length - 1, Math.floor(step / 9));
  const sub = step % 9; // 0 = xor-in, 1..8 = bit k-1
  const bs = trace[bi];
  const bit = sub > 0 ? bs.bits[sub - 1] : null;

  // corrupt mode
  const [pos, setPos] = useState(60);
  const [delta, setDelta] = useState(1);
  const corrupted = useMemo(() => {
    const chars = base.split("");
    const p = Math.min(pos, base.length - 5);
    const c = chars[p].charCodeAt(0);
    let nc = c + delta;
    if (nc > 126) nc = 33 + (nc - 127);
    chars[p] = String.fromCharCode(nc);
    return { s: chars.join(""), p };
  }, [base, pos, delta]);
  const cr = useMemo(() => parseBrCode(corrupted.s), [corrupted.s]);
  const flipped = (base.charCodeAt(corrupted.p) ^ corrupted.s.charCodeAt(corrupted.p)).toString(2).replace(/0/g, "").length;

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "step", label: "step through the register" },
            { value: "corrupt", label: "corrupt one character" },
          ]}
        />
        {mode === "step" ? (
          <>
            <Button variant="primary" onClick={t.toggle}>
              {t.running ? "Pause" : "Play"}
            </Button>
            <Button onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}>Step bit</Button>
            <Button onClick={() => setStep((s) => Math.min(totalSteps - 1, (Math.floor(s / 9) + 1) * 9))}>Next byte</Button>
            <Button variant="ghost" onClick={() => setStep(0)}>
              Reset
            </Button>
          </>
        ) : (
          <>
            <Slider label="position" value={pos} min={0} max={base.length - 5} onChange={setPos} className="min-w-52 flex-1" />
            <Slider label="char +" value={delta} min={1} max={8} onChange={setDelta} className="min-w-40" />
          </>
        )}
      </Controls>

      {mode === "step" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel title={`CRC16/CCITT-FALSE · poly 0x1021 · init 0xFFFF · first ${STEP_BYTES} bytes`}>
            <div className="mb-3 flex flex-wrap gap-0.5 font-mono text-sm">
              {payload.split("").map((ch, i) => (
                <span
                  key={i}
                  className={clsx(
                    "rounded px-[3px]",
                    i < STEP_BYTES ? (i === bi ? "bg-accent text-black" : i < bi ? "text-ink" : "text-muted") : "text-faint",
                  )}
                >
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              {sub === 0 ? (
                <>
                  <Register value={bs.regIn} label={`register before byte ${bi}`} />
                  <div className="font-mono text-xs text-muted">
                    XOR in byte &apos;{bs.char}&apos; = 0x{bs.byte.toString(16).toUpperCase().padStart(2, "0")} = {bin8(bs.byte)} shifted into the high 8 bits
                  </div>
                  <Register value={bs.afterXorIn} label="register ^ (byte << 8)" highlight="msb" />
                </>
              ) : (
                bit && (
                  <>
                    <Register value={bit.before} label={`bit ${bit.bit + 1}/8 of byte ${bi}: top bit = ${bit.msb}`} highlight="msb" />
                    <div className="font-mono text-xs text-muted">
                      {bit.msb ? (
                        <>
                          top bit was 1 → shift left, then XOR with <span className="text-info">0x1021</span> ({bin16(POLY)})
                        </>
                      ) : (
                        <>top bit was 0 → just shift left</>
                      )}
                    </div>
                    <Register value={bit.after} label="register after" highlight={bit.msb ? "poly" : undefined} />
                  </>
                )
              )}
            </div>
          </Panel>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="byte" value={`${bi + 1}/${payload.length}`} hint={`'${bs.char}'`} />
              <Stat label="register" value={`0x${hex4(sub === 0 ? bs.afterXorIn : bit!.after)}`} />
              <Stat label="final CRC" value={hex4(crc16(payload))} tone="good" hint={`over all ${payload.length} bytes`} />
              <Stat label="in string" value={base.slice(-4)} hint="63 04 ····" />
            </div>
            <Panel title="Register after each byte" bodyClassName="p-0">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {trace.map((b, i) => (
                      <tr key={i} className={clsx("border-b border-line/60", i === bi && "bg-white/5")}>
                        <td className="px-3 py-1 font-mono text-faint">{i}</td>
                        <td className="px-2 py-1 font-mono text-ink">&apos;{b.char}&apos;</td>
                        <td className="px-2 py-1 font-mono text-muted">0x{b.byte.toString(16).toUpperCase().padStart(2, "0")}</td>
                        <td className={clsx("px-3 py-1 text-right font-mono", i <= bi ? "text-accent" : "text-faint")}>{i < bi || (i === bi && sub === 8) ? hex4(b.regOut) : "····"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel title="Same QR, one character changed">
            <div className="font-mono text-[13px] leading-6 break-all">
              {corrupted.s.split("").map((ch, i) => (
                <span key={i} className={clsx(i === corrupted.p && "rounded bg-bad px-[2px] text-black", i >= corrupted.s.length - 4 && "text-warn")}>
                  {ch}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">
              Position {corrupted.p}: &apos;{base[corrupted.p]}&apos; → &apos;{corrupted.s[corrupted.p]}&apos; ({flipped} bit{flipped === 1 ? "" : "s"} flipped). The stored CRC still says{" "}
              <span className="font-mono text-warn">{cr.crcGiven}</span>; recomputing over the received bytes gives <span className="font-mono text-bad">{cr.crcComputed}</span>.
              {cr.issues.length > 1 && " The change also broke framing or a field rule — see below."}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {cr.issues.map((i, k) => (
                <li key={k} className={i.level === "error" ? "text-bad" : "text-warn"}>
                  <span className="font-mono">{i.path}</span> {i.msg}
                </li>
              ))}
            </ul>
          </Panel>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="stored" value={cr.crcGiven ?? "—"} />
              <Stat label="recomputed" value={cr.crcComputed ?? "—"} tone={cr.crcGiven === cr.crcComputed ? "good" : "bad"} />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              A 16-bit CRC catches every single-bit error, every odd number of flipped bits, and every burst up to 16 bits, so a scanned or pasted code with one wrong
              character is always rejected before any network call. It is an integrity check, not authentication: anyone can recompute it, which is why dynamic payloads are
              signed with JWS.
            </p>
          </div>
        </div>
      )}
      <p className="text-xs text-faint">
        Try: step through the first bytes and watch each 1 falling off the top trigger an XOR with 0x1021; then switch to corrupt mode and drag the position — every
        single change produces a different CRC.
      </p>
    </div>
  );
}
