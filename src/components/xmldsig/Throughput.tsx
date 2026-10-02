"use client";

import { useState } from "react";
import { Button, Controls, Panel, Slider, Stat } from "@/components/ui";
import { utf8 } from "./c14n";
import { demoKeys } from "./keys";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0));

/** Run RSA-2048 sign/verify for ~budget ms and return ops/s (single thread, this browser). */
async function bench(): Promise<{ sign: number; verify: number }> {
  const { a } = await demoKeys();
  const data = utf8("<ds:SignedInfo xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\">" + "x".repeat(1400) + "</ds:SignedInfo>");
  const alg = { name: "RSASSA-PKCS1-v1_5" };
  let sig = new Uint8Array(await crypto.subtle.sign(alg, a.privateKey, data));
  let n = 0;
  let t0 = performance.now();
  while (performance.now() - t0 < 700) {
    sig = new Uint8Array(await crypto.subtle.sign(alg, a.privateKey, data));
    n++;
  }
  const sign = (n * 1000) / (performance.now() - t0);
  n = 0;
  t0 = performance.now();
  while (performance.now() - t0 < 400) {
    await crypto.subtle.verify(alg, a.publicKey, sig, data);
    n++;
  }
  const verify = (n * 1000) / (performance.now() - t0);
  return { sign, verify };
}

function Bar({ label, used, cap, color }: { label: string; used: number; cap: number; color: string }) {
  const pct = cap > 0 ? used / cap : 0;
  const w = Math.min(1, pct) * 100;
  return (
    <div className="text-xs">
      <div className="flex justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className={pct > 1 ? "font-mono text-bad" : pct > 0.7 ? "font-mono text-warn" : "font-mono text-ink"}>{(pct * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full" style={{ width: `${w.toFixed(1)}%`, background: pct > 1 ? "#f87171" : color }} />
      </div>
    </div>
  );
}

export function Throughput() {
  const [tps, setTps] = useState(2000);
  const [share, setShare] = useState(15);
  const [peak, setPeak] = useState(3);
  const [signPerCore, setSignPerCore] = useState(1500);
  const [verifyPerCore, setVerifyPerCore] = useState(40000);
  const [hsmRate, setHsmRate] = useState(5000);
  const [cores, setCores] = useState(16);
  const [measured, setMeasured] = useState<{ sign: number; verify: number } | null>(null);
  const [running, setRunning] = useState(false);

  // per payment this PSP takes part in: as payer it signs pacs.008 and verifies the SPI's pacs.002;
  // as receiver it verifies pacs.008 and signs its pacs.002 answer, then verifies the SPI's confirmation.
  const myPayments = tps * peak * (share / 100);
  const signs = myPayments * 1; // ~1 signature per payment on either side
  const verifies = myPayments * 1.5; // ~1–2 verifications per payment (averaged)
  const signCores = signs / signPerCore;
  const verifyCores = verifies / verifyPerCore;
  const hsms = Math.ceil(signs / hsmRate);
  const msPerSign = 1000 / signPerCore;

  return (
    <div className="space-y-4">
      <Controls>
        <Button
          variant="primary"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            const r = await bench();
            setMeasured(r);
            setSignPerCore(Math.max(50, Math.round(r.sign / 50) * 50));
            setVerifyPerCore(Math.max(500, Math.round(r.verify / 500) * 500));
            setRunning(false);
          }}
        >
          {running ? "benchmarking…" : "Benchmark RSA-2048 in this browser"}
        </Button>
        <span className="text-xs text-faint">
          {measured
            ? `measured: ${measured.sign.toFixed(0)} signs/s · ${measured.verify.toFixed(0)} verifies/s on one thread (WebCrypto)`
            : "defaults are typical OpenSSL figures for one modern server core"}
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Panel title="Signature load at peak">
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            <Slider label="Pix average, whole system" value={tps} min={200} max={10000} step={100} onChange={setTps} format={(v) => `${fmt(v)}/s`} />
            <Slider label="peak / average" value={peak} min={1} max={8} step={0.5} onChange={setPeak} format={(v) => `${v}×`} />
            <Slider label="your PSP's share" value={share} min={1} max={60} onChange={setShare} format={(v) => `${v}%`} />
            <Slider label="RSA signs / s / core" value={signPerCore} min={50} max={5000} step={50} onChange={setSignPerCore} format={fmt} />
            <Slider label="RSA verifies / s / core" value={verifyPerCore} min={500} max={100000} step={500} onChange={setVerifyPerCore} format={fmt} />
            <Slider label="HSM rated signs / s" value={hsmRate} min={500} max={20000} step={500} onChange={setHsmRate} format={fmt} />
            <Slider label="cores you budget for crypto" value={cores} min={1} max={64} onChange={setCores} format={(v) => `${v}`} />
          </div>
          <div className="mt-5 space-y-3">
            <Bar label={`signing: ${fmt(signs)}/s needs ${signCores.toFixed(1)} cores`} used={signCores} cap={cores} color="#f5a524" />
            <Bar label={`verifying: ${fmt(verifies)}/s needs ${verifyCores.toFixed(2)} cores`} used={verifyCores} cap={cores} color="#34d399" />
            <Bar label={`one HSM partition at ${fmt(hsmRate)} signs/s`} used={signs} cap={hsmRate} color="#38bdf8" />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            The asymmetry is the point: an RSA private-key operation is a 2048-bit modular exponentiation with a large secret exponent, while
            verification uses e = 65537 (17 squarings). Signing costs 20–40× more than verifying. Canonicalization and SHA-256 of a few KB are
            microseconds; the RSA sign dominates.
          </p>
        </Panel>
        <div className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          <Stat label="your payments at peak" value={`${fmt(myPayments)}/s`} hint={`${fmt(tps * peak)}/s system-wide`} />
          <Stat label="signatures" value={`${fmt(signs)}/s`} hint={`${msPerSign.toFixed(2)} ms CPU each`} />
          <Stat label="HSMs (N+1)" value={hsms + 1} tone={hsms + 1 > 4 ? "warn" : "neutral"} hint={`${hsms} to carry peak + 1 spare`} />
          <Stat label="latency added" value={`~${msPerSign.toFixed(1)} ms`} hint="per signature, before queueing" />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: press benchmark, then raise the share to a large PSP (30–40%) at a 4× peak. The CPU cost is manageable on a few cores, but the
        private key would then sit in the memory of every app server. An HSM keeps it in tamper-resistant hardware; the price is that the
        HSM&apos;s rated signs/s becomes a capacity limit you must plan for, with spares. Volumes are illustrative; see BCB&apos;s Pix
        statistics for real figures.
      </p>
    </div>
  );
}
