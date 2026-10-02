"use client";

import { useMemo, useState } from "react";
import { Panel, Segmented } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { camt054, camt060 } from "./messages";
import { XmlView } from "./XmlView";
import { e2eId, msgId, PAYER_PSP } from "./xml";

type S = "received" | "rejectedMsg" | "reserved" | "forwarded" | "confirmed" | "settled" | "rejected";

const STATES: Record<S, { x: number; y: number; label: string; sub: string; tone: string; text: string; query: "book" | "info" | "none" | "infoCode" }> = {
  received: {
    x: 80, y: 40, label: "Received", sub: "t1′ · HTTP 201", tone: "#60a5fa", query: "info",
    text: "ICOM answered 201 with a storage protocol: the message is persisted in the SPI and will be processed (Regulamento do SPI art. 35). It is not yet accepted, and no money is reserved.",
  },
  rejectedMsg: {
    x: 80, y: 148, label: "Message rejected", sub: "admi.002", tone: "#fbbf24", query: "none",
    text: "XSD, signature or sender errors are caught at the message layer and answered with admi.002. No transaction exists for that EndToEndId, so a corrected message can be sent again.",
  },
  reserved: {
    x: 270, y: 40, label: "Accepted", sub: "amount reserved in Conta PI", tone: "#a78bfa", query: "info",
    text: "The SPI blocked the amount in the payer PSP's Conta PI. Acceptance by the SPI happens exactly here (art. 36 §2). Balance checks need not follow arrival order. If funds are short: immediate, definitive RJCT AM04.",
  },
  forwarded: {
    x: 460, y: 40, label: "Awaiting receiver", sub: "t2 · pacs.008 available", tone: "#a78bfa", query: "info",
    text: "The order sits in the receiver PSP's queue until it is fetched and answered. This is the confirmation of the capacity to receive (art. 37); it eats into the same 40 s budget.",
  },
  confirmed: {
    x: 650, y: 40, label: "Confirmed", sub: "t3′ · ACSP", tone: "#34d399", query: "info",
    text: "The receiver PSP answered ACSP and holds a provisional credit. The SPI now settles if the order has not expired.",
  },
  settled: {
    x: 860, y: 40, label: "Settled", sub: "t4 · ACSC / ACCC", tone: "#34d399", query: "book",
    text: "Both Conta PI balances changed in the BCB's books: the transfer is final, irrevocable and unconditional (art. 40). The only way back is a new operation: a pacs.004 return.",
  },
  rejected: {
    x: 560, y: 148, label: "Rejected", sub: "RJCT + reason", tone: "#f87171", query: "infoCode",
    text: "Terminal. Reached from 'Accepted' (AM04, AB11, AG12…), from 'Awaiting receiver' (receiver RJCT with AC03, BE01… or AB03 when the clock runs out) or from 'Confirmed' if the deadline passes before settlement. Any reserve is released.",
  },
};

const EDGES: [S, S, string][] = [
  ["received", "reserved", "valid"],
  ["received", "rejectedMsg", "bad XML/sig"],
  ["reserved", "forwarded", "forward"],
  ["forwarded", "confirmed", "ACSP"],
  ["confirmed", "settled", "settle"],
  ["reserved", "rejected", "AM04, AB11…"],
  ["forwarded", "rejected", "RJCT / AB03"],
  ["confirmed", "rejected", "expired"],
];

const E2E = e2eId(PAYER_PSP.ispb, "2026-10-02T14:03:27.780Z", 99);

export function StateMachine() {
  const [s, setS] = useState<S>("settled");
  const [show, setShow] = useState<"req" | "res">("res");
  const st = STATES[s];
  const req = useMemo(() => camt060({ from: PAYER_PSP.ispb, e2e: E2E, at: "2026-10-02T14:05:00.120Z", seed: 21 }), []);
  const res = useMemo(
    () =>
      camt054({
        to: PAYER_PSP.ispb,
        reqMsgId: msgId(PAYER_PSP.ispb, 21),
        e2e: E2E,
        amount: "150.00",
        dir: "DBIT",
        booked: st.query === "book",
        code: st.query === "infoCode" ? "AB03" : undefined,
        at: "2026-10-02T14:05:00.410Z",
        seed: 22,
      }),
    [st.query],
  );
  const W = 940;
  const color = CHAPTER_COLOR.spi;

  return (
    <div className="space-y-4">
      <Panel title="Life of an EndToEndId in the SPI (click a state)">
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} 196`} className="w-full" style={{ minWidth: 560 }} role="img" aria-label="transaction state machine">
            <defs>
              <marker id="spi-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="#5a6275" />
              </marker>
            </defs>
            {EDGES.map(([a, b, l], i) => {
              const A = STATES[a];
              const B = STATES[b];
              const horiz = A.y === B.y;
              const x1 = horiz ? A.x + 70 : A.x + (B.x > A.x ? 30 : 0);
              const y1 = horiz ? A.y : A.y + 22;
              const x2 = horiz ? B.x - 72 : B.x + (B.x < A.x ? 40 : B.x > A.x ? -40 : 0);
              const y2 = horiz ? B.y : B.y - 22;
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5a6275" strokeWidth={1.3} markerEnd="url(#spi-arr)" />
                  <text x={(x1 + x2) / 2 + (horiz ? 0 : 6)} y={(y1 + y2) / 2 - 5} fontSize={9.5} fill="#8a93a8" textAnchor={horiz ? "middle" : "start"} fontFamily="var(--font-mono)">
                    {l}
                  </text>
                </g>
              );
            })}
            {(Object.keys(STATES) as S[]).map((k) => {
              const n = STATES[k];
              const on = k === s;
              return (
                <g key={k} onClick={() => setS(k)} className="cursor-pointer">
                  <rect x={n.x - 70} y={n.y - 22} width={140} height={44} rx={9} fill={on ? n.tone + "33" : "#171b24"} stroke={on ? n.tone : "#242a38"} strokeWidth={on ? 2 : 1} />
                  <text x={n.x} y={n.y - 3} textAnchor="middle" fontSize={12} fill="#e7e9f0" fontWeight={600}>
                    {n.label}
                  </text>
                  <text x={n.x} y={n.y + 12} textAnchor="middle" fontSize={9.5} fill={n.tone}>
                    {n.sub}
                  </text>
                </g>
              );
            })}
            <text x={W - 10} y={190} textAnchor="end" fontSize={9.5} fill={color}>
              finality is a single instant: t4
            </text>
          </svg>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          <b className="text-ink">{st.label}.</b> {st.text}
        </p>
      </Panel>
      <Panel
        title="Asking the SPI: camt.060 → camt.054"
        right={
          <Segmented
            value={show}
            onChange={setShow}
            options={[
              { value: "req", label: "camt.060 request" },
              { value: "res", label: "camt.054 answer" },
            ]}
          />
        }
      >
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          There is no pacs.028 in the SPI catalog. A direct participant can ask for the details of one Conta PI entry by sending camt.060 with ReqdMsgNmId = camt.054 and the
          EndToEndId (or a return&apos;s RtrId) in RptgReq/Id. {st.query === "none" ? "In this state there is no transaction, so there is no entry to find." : st.query === "book" ? "Settled entries come back as BOOK." : st.query === "infoCode" ? "Rejected ones come back as INFO with the pacs.002 reason code in AddtlNtryInf." : "Unsettled ones are INFO: recorded for information, not booked."}{" "}
          The catalog&apos;s first advice, though, is not to query at all: resend the same operation and let idempotency return the earlier answer.
        </p>
        <XmlView root={show === "req" ? req : res} compact maxHeight={360} defaultPath={show === "req" ? "RptgReq/Id" : "Sts/Cd"} />
      </Panel>
      <p className="text-xs text-faint">Try: click Settled and then Rejected and compare Ntry/Sts/Cd in the camt.054 answer (BOOK vs INFO + AddtlNtryInf).</p>
    </div>
  );
}
