"use client";

import { useState } from "react";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Check, Hint, XmlBlock, brl } from "./shared";
import { MODALIDADES, evaluateSaque, saqueXml, type Modalidade, type SaqueKind } from "./saqueModel";

export function SaqueTroco() {
  const [kind, setKind] = useState<SaqueKind>("troco");
  const [modalidade, setMod] = useState<Modalidade>("AGTEC");
  const [purchase, setPurchase] = useState(48);
  const [cash, setCash] = useState(200);
  const [hour, setHour] = useState(14);
  const [userDayLimit, setUDL] = useState(1500);
  const [used, setUsed] = useState(0);
  const input = { kind, modalidade, purchase, cash, hour, userDayLimit, usedInPeriod: used, fssIspb: "90400888" };
  const ev = evaluateSaque(input);
  const m = MODALIDADES[modalidade];
  const fss = m.agentMin === null ? m.rco : m.rco - m.agentMin;

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "saque", label: "Pix Saque" },
            { value: "troco", label: "Pix Troco" },
          ]}
        />
        <Segmented
          value={modalidade}
          onChange={setMod}
          options={(Object.keys(MODALIDADES) as Modalidade[]).map((k) => ({ value: k, label: k }))}
        />
        <Slider label="hour" value={hour} min={0} max={23} onChange={setHour} format={(v) => `${v}h`} className="min-w-48 flex-1" />
      </Controls>
      <Controls>
        {kind === "troco" && (
          <Slider label="purchase" value={purchase} min={0} max={500} step={1} onChange={setPurchase} format={brl} className="min-w-56 flex-1" />
        )}
        <Slider label="cash" value={cash} min={0} max={3500} step={10} onChange={setCash} format={brl} className="min-w-56 flex-1" />
        <Slider label="user's day limit" value={userDayLimit} min={500} max={3500} step={100} onChange={setUDL} format={brl} className="min-w-56 flex-1" />
        <Slider label="cash already taken this period" value={used} min={0} max={3000} step={50} onChange={setUsed} format={brl} className="min-w-56 flex-1" />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="pacs.008 · CdtTrfTxInf (fragment)" right={<span className="font-mono text-[11px] text-faint">pacs.008.spi.1.16</span>}>
          <XmlBlock xml={saqueXml(input)} highlight={(l) => /Purp|Rsn|Prtry>AG|Issr|IntrBkSttlmAmt/.test(l)} />
          <p className="mt-2 text-xs text-faint">
            The initiation itself is a QR Code: a static one carries the FSS ISPB in tag 26, sub-tag 03 (<span className="font-mono">fss</span>) and that
            alone marks it as Saque; Troco exists only in dynamic QR Codes, where the JSON payload has{" "}
            <span className="font-mono">valor.retirada.troco</span> (or <span className="font-mono">.saque</span>) with{" "}
            <span className="font-mono">prestadorDoServicoDeSaque</span> and <span className="font-mono">modalidadeAgente</span>.
          </p>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="IntrBkSttlmAmt" value={brl(ev.total)} hint={kind === "troco" ? "purchase + cash" : "cash only"} />
            <Stat label="period" value={ev.day ? "day" : "night"} tone={ev.day ? "neutral" : "warn"} hint={`cap ${brl(ev.perTxCap)}/tx`} />
            <Stat label="RCO (payer PSP pays)" value={brl(ev.rco)} hint="per Saque, or per Troco cash part" />
            <Stat label="verdict" value={ev.ok ? "accept" : "reject"} tone={ev.ok ? "good" : "bad"} />
          </div>
          <Panel title="Who gets the RCO">
            <div className="space-y-1 text-[13px] text-muted">
              <div className="flex justify-between">
                <span>facilitador (FSS)</span>
                <span className="font-mono text-ink">{m.agentMin === null ? brl(fss) : `≤ ${brl(fss)}`}</span>
              </div>
              <div className="flex justify-between">
                <span>agente de saque</span>
                <span className="font-mono text-ink">{m.agentMin === null ? (modalidade === "AGFSS" ? "—" : "negotiated") : `≥ ${brl(m.agentMin)}`}</span>
              </div>
              <p className="pt-1 text-xs text-faint">{m.desc} Values from art. 96-B as amended by Res. BCB 559/2026 (in force 1 Jul 2026). The whole RCO goes to the FSS, which passes the agent its share.</p>
            </div>
          </Panel>
          <Panel title="Validation (payer PSP)">
            <ul className="space-y-1.5">
              {ev.rules.map((r, i) => (
                <Check key={i} ok={r.ok} warn={r.warn}>
                  {r.text}
                </Check>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <Hint>switch to Troco and push the cash past R$1,000 after 20h; then move the hour back to 14h. Change AGTEC to AGTOT and watch the RCO double.</Hint>
    </div>
  );
}
