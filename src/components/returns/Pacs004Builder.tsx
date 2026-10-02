"use client";

import { useState } from "react";
import { Button, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { IdAnatomy, RuleList, TextField } from "@/components/spi/Field";
import { XmlView } from "@/components/spi/XmlView";
import { brl, PAYEE_PSP, PAYER_PSP } from "@/components/spi/xml";
import { buildPacs004, ORIGINAL, RETURN_REASONS, type Original, type ReturnReason } from "./pacs004";

export function Pacs004Builder() {
  const [kind, setKind] = useState<Original["kind"]>("IPAY");
  const [amount, setAmount] = useState(30);
  const [reason, setReason] = useState<ReturnReason>("MD06");
  const [prio, setPrio] = useState<"HIGH" | "NORM">("HIGH");
  const [days, setDays] = useState(3);
  const [addtl, setAddtl] = useState("");
  const [ustrd, setUstrd] = useState("estorno parcial: item fora de estoque");
  const [seed, setSeed] = useState(1);
  const original: Original = { ...ORIGINAL, kind, cash: kind === "IPAY" ? 0 : kind === "OTHR" ? ORIGINAL.amount : 40 };
  const b = buildPacs004({ original, amount, reason, prio, addtl, ustrd, days, alreadyReturned: 0, seed });
  const failing = b.rules.filter((r) => !r.ok);
  const r = b.rtrId;
  const color = CHAPTER_COLOR.returns;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Return inputs" bodyClassName="space-y-4">
          <div>
            <div className="mb-1 text-xs text-muted">original pacs.008 (R$ 100,00) was</div>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "IPAY", label: "IPAY" },
                { value: "OTHR", label: "Saque" },
                { value: "GSCB", label: "Troco (60 + 40 cash)" },
              ]}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">RtrRsnInf/Rsn/Cd</div>
            <Segmented value={reason} onChange={setReason} options={RETURN_REASONS.map((x) => ({ value: x.code, label: x.code }))} />
            <p className="mt-1 text-[11px] text-faint">{RETURN_REASONS.find((x) => x.code === reason)?.text}</p>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">SttlmPrty</div>
            <Segmented
              value={prio}
              onChange={setPrio}
              options={[
                { value: "HIGH", label: "HIGH" },
                { value: "NORM", label: "NORM" },
              ]}
            />
          </div>
          <Slider label="amount" value={amount} min={0} max={150} step={5} onChange={setAmount} format={brl} />
          <Slider label="days after the Pix" value={days} min={0} max={120} step={1} onChange={setDays} format={(v) => `${v} d`} />
          <TextField label="RmtInf/Ustrd (to the original payer)" value={ustrd} onChange={setUstrd} mono={false} hint={`${ustrd.length}/140`} />
          <TextField label="RtrRsnInf/AddtlInf" value={addtl} onChange={setAddtl} mono={false} hint={`${addtl.length}/105`} />
          <Button onClick={() => setSeed((s) => s + 1)}>New RtrId</Button>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title="RtrId anatomy" right={<span className="font-mono text-[11px] text-faint">idempotency key of the return</span>}>
            <IdAnatomy
              parts={[
                { text: r.slice(0, 1), label: "D (devolução)", color },
                { text: r.slice(1, 9), label: `ISPB ${PAYEE_PSP.name}`, color: "#60a5fa" },
                { text: r.slice(9, 21), label: "yyyyMMddHHmm UTC", color: "#34d399" },
                { text: r.slice(21), label: "11 alnum", color: "#fbbf24" },
              ]}
            />
          </Panel>
          <Panel title="The roles swap">
            <RoleSwap />
          </Panel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="rules" value={`${b.rules.length - failing.length}/${b.rules.length}`} tone={failing.length ? "bad" : "good"} />
            <Stat label="returnable left" value={brl(Math.max(0, (reason === "SL02" ? original.cash : kind === "IPAY" ? 100 : 100 - original.cash) - amount))} />
            <Stat label="window" value={reason === "SL02" ? "no 90 d cap" : `${Math.max(0, 90 - days)} d left`} tone={reason !== "SL02" && days > 90 ? "bad" : "neutral"} />
          </div>
          <Panel title="Rules">
            <RuleList rules={b.rules} />
          </Panel>
        </div>
      </div>
      <Panel title="Generated message" right={<span className="font-mono text-[11px] text-faint">pacs.004.spi.1.5</span>}>
        <XmlView root={b.root} title={`${b.msgId}.xml`} defaultPath="OrgnlEndToEndId" />
      </Panel>
      <p className="text-xs text-faint">
        Try: hover OrgnlTxRef/DbtrAgt and CdtrAgt and compare with the diagram: the debtor of the return is the original creditor&apos;s PSP. Push the amount above R$ 100 (AM09)
        or the days past 90 (DT05). Pick SL02 on an ordinary IPAY Pix: the original payer&apos;s PSP rejects it with SL02. Switch to Troco and SL02: only the R$ 40 cash part is
        returnable that way, and without the 90-day cap.
      </p>
    </div>
  );
}

function RoleSwap() {
  const W = 700;
  const box = (x: number, y: number, t: string, s: string, c: string) => (
    <g>
      <rect x={x} y={y} width={180} height={40} rx={8} fill="#171b24" stroke={c} />
      <text x={x + 90} y={y + 17} textAnchor="middle" fontSize={12} fill="#e7e9f0" fontWeight={600}>
        {t}
      </text>
      <text x={x + 90} y={y + 31} textAnchor="middle" fontSize={10} fill="#8a93a8" fontFamily="var(--font-mono)">
        {s}
      </text>
    </g>
  );
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} 162`} className="w-full" style={{ minWidth: 480 }} role="img" aria-label="roles in pacs.008 vs pacs.004">
        <defs>
          <marker id="ret-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#a78bfa" />
          </marker>
          <marker id="ret-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#c084fc" />
          </marker>
        </defs>
        <text x={10} y={36} fontSize={11} fill="#a78bfa" fontFamily="var(--font-mono)">
          pacs.008
        </text>
        {box(80, 12, `DbtrAgt · ${PAYER_PSP.name}`, PAYER_PSP.ispb, "#a78bfa")}
        {box(450, 12, `CdtrAgt · ${PAYEE_PSP.name}`, PAYEE_PSP.ispb, "#a78bfa")}
        <line x1={262} y1={32} x2={446} y2={32} stroke="#a78bfa" strokeWidth={2} markerEnd="url(#ret-a)" />
        <text x={354} y={26} textAnchor="middle" fontSize={10.5} fill="#a78bfa">
          R$ 100,00 · E…
        </text>
        <text x={10} y={116} fontSize={11} fill="#c084fc" fontFamily="var(--font-mono)">
          pacs.004
        </text>
        {box(80, 92, `CdtrAgt · ${PAYER_PSP.name}`, "OrgnlTxRef/CdtrAgt", "#c084fc")}
        {box(450, 92, `DbtrAgt · ${PAYEE_PSP.name}`, "OrgnlTxRef/DbtrAgt", "#c084fc")}
        <line x1={448} y1={112} x2={264} y2={112} stroke="#c084fc" strokeWidth={2} markerEnd="url(#ret-b)" />
        <text x={354} y={106} textAnchor="middle" fontSize={10.5} fill="#c084fc">
          ≤ R$ 100,00 · RtrId D…
        </text>
        <text x={354} y={128} textAnchor="middle" fontSize={10.5} fill="#c084fc">
          OrgnlEndToEndId E…
        </text>
        <text x={354} y={154} textAnchor="middle" fontSize={10} fill="#5a6275">
          remetente = original receiver · destinatário = original payer
        </text>
      </svg>
    </div>
  );
}
