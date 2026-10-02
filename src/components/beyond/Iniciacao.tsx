"use client";

import { useState } from "react";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";
import { Check, Hint, XmlBlock } from "./shared";
import { LCL, SAMPLE_TXID, pacs008, validate, type Lcl } from "./initiation";

export function Iniciacao() {
  const [lcl, setLcl] = useState<Lcl>("INIC");
  const [via, setVia] = useState<"direct" | "itp">("itp");
  const [txid, setTxid] = useState(SAMPLE_TXID.INIC);
  const itpCnpj = "33445566000172";
  const pick = (v: Lcl) => {
    setLcl(v);
    setTxid(SAMPLE_TXID[v]);
  };
  const input = { lcl, viaItp: via === "itp", txid, itpCnpj };
  const v = validate(input);
  const ok = v.checks.every((c) => c.ok);

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented value={lcl} onChange={pick} options={(Object.keys(LCL) as Lcl[]).map((k) => ({ value: k, label: k }))} />
        <Segmented
          value={via}
          onChange={setVia}
          options={[
            { value: "direct", label: "payer's own app" },
            { value: "itp", label: "via initiator (ITP)" },
          ]}
        />
        <label className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
          TxId
          <input
            value={txid}
            onChange={(e) => setTxid(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink"
            placeholder="(empty)"
          />
        </label>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title={`pacs.008 · LclInstrm ${lcl} — ${LCL[lcl].name}`}>
          <XmlBlock xml={pacs008(input)} highlight={(l) => /LclInstrm|InitgPty|TxId|SvcLvl/.test(l)} />
          <p className="mt-2 text-xs text-faint">
            Abbreviated; Dbtr, DbtrAgt, CdtrAgt and AccptncDtTm omitted. <span className="font-mono">Prxy</span> (the key) is shown for key/QR-based forms as an illustration —
            check the catalog for its exact fill rule.
          </p>
        </Panel>
        <div className="space-y-3 self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="SPI would" value={ok ? "accept" : "reject"} tone={ok ? "good" : "bad"} hint="schema + fill rules" />
            <Stat label="channel" value={lcl === "AUTO" ? "secondary" : "primary"} hint={lcl === "AUTO" ? "NORM · PAGAGD · 0h–8h window" : "HIGH · PAGPRI · 40 s"} />
          </div>
          <Panel title="Fill rules">
            <ul className="space-y-1.5">
              {v.checks.map((c, i) => (
                <Check key={i} ok={c.ok}>
                  {c.text}
                </Check>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <Hint>pick INIC and switch to &quot;payer&apos;s own app&quot;; then choose AUTO via ITP and see the TxId disappear. Paste a 20-char txid into QRDN to break the 26–35 rule.</Hint>
    </div>
  );
}
