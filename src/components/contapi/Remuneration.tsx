"use client";

import { useState } from "react";
import { Controls, Panel, Slider, Stat } from "@/components/ui";
import { fmt } from "@/lib/random";
import { XmlView, envelope, x, type Glossary } from "./xml";
import { BAL_GLOSSARY } from "./BalanceBlocking";
import { ME, remuneration } from "./model";

const GLOSS: Glossary = {
  ...BAL_GLOSSARY,
  "Bal/Tp/CdOrPrtry/Prtry": (
    <>
      Remuneration statement types: <b>PSSR</b> parcela do saldo sujeito à remuneração (S), <b>REMN</b> the remuneration actually credited (R), <b>VSME</b> the 50% of
      e-money balances allocated at the BCB used in the cap, <b>VVSR</b> the 20% of the average VSR used in the cap.
    </>
  ),
  "Stmt/Id": "MsgId of the camt.060 CRE request; for the automatic remuneration notice the SPI fills it with 32 zeros.",
};

const bi = (v: number) => (v >= 1e9 ? `R$ ${fmt(v / 1e9, 2)} bi` : `R$ ${fmt(v / 1e6, 1)} M`);

export function Remuneration() {
  const [balance, setBalance] = useState(900); // R$ M at STR close
  const [selic, setSelic] = useState(15);
  const [eMoney, setEMoney] = useState(800); // R$ M
  const [vsr, setVsr] = useState(2000); // R$ M
  const r = remuneration(balance * 1e6, selic, eMoney * 1e6, vsr * 1e6);
  const day = 252;
  const msgId = "M00038166rem0001Qs3Wd6Fg9Hj2Kl5Z";
  const stmt = envelope(
    "camt.053",
    "1.4",
    "00038166",
    ME,
    msgId,
    "2026-10-05T19:12:40.118Z",
    x(
      "BkToCstmrStmt",
      x("GrpHdr", x("MsgId", msgId), x("CreDtTm", "2026-10-05T19:12:40.118Z")),
      x(
        "Stmt",
        { tag: "Id", text: "0".repeat(32), mark: "warn" },
        x("Acct", x("Id", x("Othr", x("Id", ME)))),
        ...(
          [
            ["PSSR", r.S, "2026-10-02T21:30:00.000Z"],
            ["REMN", r.R, "2026-10-05T19:12:39.902Z"],
            ["VSME", r.vsme, "2026-10-02T21:30:00.000Z"],
            ["VVSR", r.vvsr, "2026-10-02T21:30:00.000Z"],
          ] as const
        ).map(([tp, v, dt]) =>
          x("Bal", x("Tp", x("CdOrPrtry", x("Prtry", tp))), { tag: "Amt", attrs: { Ccy: "BRL" }, text: v.toFixed(2), mark: tp === "REMN" ? "good" : undefined }, x("CdtDbtInd", "CRDT"), x("Dt", x("DtTm", dt))),
        ),
      ),
    ),
  );
  return (
    <div className="space-y-4">
      <Controls>
        <Slider label="balance at STR close" value={balance} min={0} max={3000} step={10} onChange={setBalance} format={(v) => `R$${fmt(v)}M`} className="min-w-60 flex-1" />
        <Slider label="Selic (annual)" value={selic} min={2} max={16} step={0.25} onChange={setSelic} format={(v) => `${v.toFixed(2)}%`} className="min-w-56 flex-1" />
        <Slider label="e-money allocated at BCB" value={eMoney} min={0} max={4000} step={50} onChange={setEMoney} format={(v) => `R$${fmt(v)}M`} className="min-w-60 flex-1" />
        <Slider label="average VSR" value={vsr} min={0} max={10000} step={100} onChange={setVsr} format={(v) => `R$${fmt(v / 1000, 1)}bi`} className="min-w-56 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="The calculation, step by step">
          <div className="space-y-1.5 font-mono text-[12px] leading-relaxed text-muted">
            <div>
              cap = max(R$ 600 M, 50%·e-money + 20%·VSR) = max(600 M, {bi(r.vsme)} + {bi(r.vvsr)}) = <span className="text-ink">{bi(r.cap)}</span>
            </div>
            <div>
              S = min(balance, cap) = <span className={r.capBinds ? "text-warn" : "text-ink"}>{bi(r.S)}</span>
              {r.capBinds && <span className="text-warn"> (cap binds: {bi(balance * 1e6 - r.S)} earns nothing)</span>}
            </div>
            <div>Selic = {r.selic.toFixed(4)} (unit form, 4 decimals)</div>
            <div>
              1 + Selic = {r.onePlus.toFixed(8)} · 1/{day} = {r.exp.toFixed(8)}
            </div>
            <div>
              (1 + Selic)^(1/252) = {r.pow.toFixed(8)} → factor = {r.factor.toFixed(8)}
            </div>
            <div>
              R = S × factor = <span className="text-ok">R$ {fmt(r.R, 2)}</span> (2 decimals, rounded)
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="per day" value={`R$ ${fmt(r.R / 1000, 1)}k`} tone="good" />
            <Stat label="per year (252 d)" value={bi(r.R * 252)} />
            <Stat label="uncompensated" value={bi(Math.max(0, balance * 1e6 - r.S))} tone={r.capBinds ? "warn" : "neutral"} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            The balance used is the one at the close of the STR regular grade, before the additional aporte window. The credit lands in the Conta PI on the next business
            day by 16:30, as an entry whose origin message is the camt.053. Only institutions authorized by the BCB are remunerated (not clearing houses or the STN).
          </p>
        </Panel>
        <Panel title="camt.053: automatic remuneration notice">
          <XmlView node={stmt} glossary={GLOSS} maxHeight={430} />
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: push the closing balance above R$ 600 M with small e-money and VSR: the cap binds and the excess earns nothing, which is the economic reason treasuries do not
        simply park the whole weekend buffer in the Conta PI forever.
      </p>
    </div>
  );
}
