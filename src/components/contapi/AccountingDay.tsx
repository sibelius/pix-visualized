"use client";

import { useState } from "react";
import { Button, Controls, Panel, Slider, Stat } from "@/components/ui";
import { XmlView, x } from "./xml";
import { WD, accountingDate, brtDate, holidayName, isBusinessDate, isoDate } from "./model";

// Thu 2026-10-08 12:00 BRT → Tue 2026-10-13 18:00 BRT. Monday 12 October is a national holiday (N. Sra. Aparecida).
const START = Date.UTC(2026, 9, 8, 15, 0);
const HOURS = 5 * 24 + 6;
const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee"];
const r1 = (v: number) => Math.round(v * 10) / 10;

const PRESETS: { label: string; at: number }[] = [
  { label: "Fri 18:45 BRT", at: Date.UTC(2026, 9, 9, 21, 45) },
  { label: "Fri 22:30 BRT (Sat in UTC)", at: Date.UTC(2026, 9, 10, 1, 30) },
  { label: "Sat 10:00", at: Date.UTC(2026, 9, 10, 13, 0) },
  { label: "Mon (holiday) 15:00", at: Date.UTC(2026, 9, 12, 18, 0) },
  { label: "Tue 00:30 BRT", at: Date.UTC(2026, 9, 13, 3, 30) },
];

const brtClock = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);

export function AccountingDay() {
  const [at, setAt] = useState(Date.UTC(2026, 9, 10, 1, 30));
  const utc = new Date(at);
  const bDate = brtDate(at);
  const acc = accountingDate(at);
  const hol = holidayName(bDate);
  const brtMin = (Math.floor((at - 3 * 3600000) / 60000) % 1440 + 1440) % 1440;
  const strOpen = isBusinessDate(bDate) && brtMin >= 390 && brtMin < 1110;

  // strip of hours coloured by accounting date
  const W = 760;
  const cells = Array.from({ length: HOURS }, (_, i) => {
    const t = START + i * 3600000;
    return { t, acc: isoDate(accountingDate(t)), bd: brtDate(t) };
  });
  const accDates = [...new Set(cells.map((c) => c.acc))];
  const cw = (W - 20) / HOURS;
  const cx = (i: number) => r1(10 + i * cw);
  const pos = r1(10 + ((at - START) / 3600000) * cw);
  const changes = cells.filter((c, i) => i > 0 && c.acc !== cells[i - 1].acc);

  const pacs002 = x(
    "FIToFIPmtStsRpt",
    x("GrpHdr", x("MsgId", "M00038166p002Rt5Yh8Uj1Ik4Ol7Pa0S"), x("CreDtTm", utc.toISOString())),
    x(
      "TxInfAndSts",
      x("OrgnlInstrId", "E1234567820261010013000Ab12Cd34E"),
      x("OrgnlEndToEndId", "E1234567820261010013000Ab12Cd34E"),
      x("TxSts", "ACSC"),
      x("FctvIntrBkSttlmDt", x("DtTm", utc.toISOString())),
      x("OrgnlTxRef", { tag: "IntrBkSttlmDt", text: isoDate(acc), mark: "good" }),
    ),
  );

  return (
    <div className="space-y-4">
      <Controls>
        <Slider
          label="settlement instant"
          value={at}
          min={START}
          max={START + (HOURS - 1) * 3600000}
          step={15 * 60000}
          onChange={setAt}
          format={(v) => `${WD[brtDate(v).getUTCDay()]} ${brtClock(v)}`}
          className="min-w-72 flex-1"
        />
        {PRESETS.map((p) => (
          <Button key={p.label} variant="ghost" onClick={() => setAt(p.at)}>
            {p.label}
          </Button>
        ))}
      </Controls>
      <Panel title="Accounting date (data contábil) by hour, Thu 8 → Tue 13 October 2026 (BRT)">
        <svg viewBox={`0 0 ${W} 92`} className="w-full select-none">
          {cells.map((c, i) => (
            <rect key={i} x={cx(i)} y={18} width={r1(cw + 0.3)} height={26} fill={PALETTE[accDates.indexOf(c.acc) % PALETTE.length]} opacity={isBusinessDate(c.bd) ? 0.75 : 0.35} />
          ))}
          {cells.map((c, i) =>
            new Date(c.t - 3 * 3600000).getUTCHours() === 0 ? (
              <g key={`d${i}`}>
                <line x1={cx(i)} x2={cx(i)} y1={10} y2={52} stroke="#e7e9f0" strokeWidth={0.8} />
                <text x={cx(i) + 3} y={12} fontSize={9.5} fill={isBusinessDate(c.bd) ? "#8a93a8" : "#f87171"}>
                  {WD[c.bd.getUTCDay()]} {isoDate(c.bd).slice(8)}
                  {holidayName(c.bd) ? " · holiday" : ""}
                </text>
              </g>
            ) : null,
          )}
          {changes.map((c) => (
            <text key={c.t} x={cx(cells.indexOf(c))} y={62} fontSize={9} textAnchor="middle" fill="#fbbf24">
              ▲ date → {c.acc.slice(5)}
            </text>
          ))}
          {accDates.map((d, i) => (
            <g key={d}>
              <rect x={10 + i * 120} y={74} width={10} height={10} fill={PALETTE[i % PALETTE.length]} opacity={0.75} />
              <text x={24 + i * 120} y={83} fontSize={10} fill="#8a93a8">
                contábil {d}
              </text>
            </g>
          ))}
          <line x1={pos} x2={pos} y1={14} y2={48} stroke="#fff" strokeWidth={2} />
        </svg>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid content-start gap-2 sm:grid-cols-2">
          <Stat label="UTC (what every message carries)" value={utc.toISOString().slice(0, 16).replace("T", " ")} />
          <Stat label="Brasília (UTC−3)" value={`${WD[bDate.getUTCDay()]} ${isoDate(bDate)} ${brtClock(at)}`} hint={hol ? hol : isBusinessDate(bDate) ? "business day" : "weekend"} tone={isBusinessDate(bDate) ? "neutral" : "warn"} />
          <Stat label="data contábil (art. 43)" value={`${WD[acc.getUTCDay()]} ${isoDate(acc)}`} tone="good" hint="pacs.002 IntrBkSttlmDt · camt.054 BookgDt" />
          <Stat label="STR right now" value={strOpen ? "open" : "closed"} tone={strOpen ? "good" : "bad"} hint="liquidity can only move when open" />
          <Stat label="REL query finds it under" value={isoDate(utc)} hint="FrDt/ToDt use the UTC calendar of the entries" />
          <Stat label="closing balance of" value={isoDate(bDate)} hint="past-day CSA uses the Brasília calendar" />
        </div>
        <Panel title="pacs.002 from the SPI (excerpt)">
          <XmlView
            node={pacs002}
            maxHeight={250}
            glossary={{
              "FctvIntrBkSttlmDt/DtTm": "When the Conta PI balances actually changed (UTC). That is the legal settlement instant.",
              "OrgnlTxRef/IntrBkSttlmDt": "dataContabil: filled by the SPI with the accounting date. Brasília calendar date of settlement if it is a business day, otherwise the next business day.",
              TxSts: "ACSC: settled.",
              OrgnlEndToEndId: "The payment this status refers to.",
            }}
          />
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: “Fri 22:30 BRT”. The UTC date is already Saturday, the Brasília date is still Friday, and the accounting date is Friday. Move to Saturday 00:15 BRT: the
        accounting date jumps to Tuesday 13, because Monday 12 October is a holiday. Three different “dates” for one payment, used by three different queries.
      </p>
    </div>
  );
}
