"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Hint } from "./shared";
import { FORMS, classify, type Form, type Party } from "./feesModel";

const TONE: Record<string, string> = { transferência: "text-ok", compra: "text-warn", "saque/troco": "text-info", invalid: "text-bad" };

export function FeeClassifier() {
  const [payer, setPayer] = useState<Party>("PF");
  const [receiver, setReceiver] = useState<Party>("PF");
  const [form, setForm] = useState<Form>("DICT");
  const [nth, setNth] = useState(12);
  const [commercial, setCommercial] = useState<"no" | "yes">("no");
  const r = classify({ payer, receiver, form, nth, commercialAccount: commercial === "yes" });

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          payer
          <Segmented value={payer} onChange={setPayer} options={[{ value: "PF", label: "PF" }, { value: "PJ", label: "PJ" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          receiver
          <Segmented value={receiver} onChange={setReceiver} options={[{ value: "PF", label: "PF" }, { value: "PJ", label: "PJ" }]} />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          receiver account for commercial use
          <Segmented value={commercial} onChange={setCommercial} options={[{ value: "no", label: "no" }, { value: "yes", label: "yes" }]} />
        </span>
        <Slider label="Pix received this month (#)" value={nth} min={1} max={60} onChange={setNth} className="min-w-56 flex-1" />
      </Controls>
      <Controls>
        <Segmented value={form} onChange={setForm} options={FORMS.map((f) => ({ value: f.value, label: f.label }))} />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Presumed purpose">
          <div className={clsx("font-mono text-2xl", TONE[r.finalidade])}>{r.finalidade}</div>
          <div className="mt-1 font-mono text-xs text-faint">{r.article}</div>
          <p className="mt-3 text-sm text-muted">{r.why}</p>
          <p className="mt-2 text-sm text-ink/90">{r.chargeable}</p>
          <div className="mt-4 text-xs text-muted">Same form, every payer × receiver pair:</div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
            <div />
            <div className="text-center text-faint">to PF</div>
            <div className="text-center text-faint">to PJ</div>
            {(["PF", "PJ"] as Party[]).map((p) => (
              <div key={p} className="contents">
                <div className="self-center text-faint">from {p}</div>
                {(["PF", "PJ"] as Party[]).map((q) => {
                  const c = classify({ payer: p, receiver: q, form, nth, commercialAccount: commercial === "yes" });
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setPayer(p);
                        setReceiver(q);
                      }}
                      className={clsx(
                        "rounded-md border px-2 py-2 text-center font-mono",
                        p === payer && q === receiver ? "border-accent" : "border-line",
                        TONE[c.finalidade],
                      )}
                    >
                      {c.finalidade}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-3 self-start">
          <Stat label="PSP ↔ PSP fees" value="forbidden" tone="bad" hint="art. 96, incl. Pix Automático; Saque/Troco RCO is the exception" />
          <Stat label="free-transfer allowance" value="30 / month" hint="per PF receiver, then purchases" />
          <div className="rounded-xl border border-line bg-panel p-3 text-[13px] leading-relaxed text-muted">
            The rule never asks what the money was for. It infers it from observable facts the PSP can see: who the parties are, how the Pix was started, and how
            often the receiver gets paid. Tap and dynamic QR imply a merchant, so they count as purchases; a key typed by hand implies a person.
          </div>
        </div>
      </div>
      <Hint>keep PF → PF by Pix key and drag the counter past 30: the same Pix becomes a purchase the receiving PSP may bill. Then pick &quot;by tap&quot;.</Hint>
    </div>
  );
}
