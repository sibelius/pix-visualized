"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { brl, decide, type RiskInput } from "./model";

type Profile = "merchant" | "person" | "mule";

const PROFILES: Record<Profile, Pick<RiskInput, "keyAgeDays" | "accountAgeDays" | "muleD90" | "scammerD90" | "distinctReporters" | "openReports" | "settlementsM12" | "payerToPerson">> = {
  merchant: { keyAgeDays: 900, accountAgeDays: 2200, muleD90: 0, scammerD90: 0, distinctReporters: 0, openReports: 0, settlementsM12: 5000, payerToPerson: false },
  person: { keyAgeDays: 400, accountAgeDays: 1500, muleD90: 0, scammerD90: 0, distinctReporters: 0, openReports: 0, settlementsM12: 100, payerToPerson: true },
  mule: { keyAgeDays: 2, accountAgeDays: 3, muleD90: 1, scammerD90: 0, distinctReporters: 1, openReports: 2, settlementsM12: 0, payerToPerson: true },
};

const VERDICT: Record<string, { color: string; text: string }> = {
  allow: { color: "#34d399", text: "send it" },
  warn: { color: "#a3e635", text: "send, with a clear warning about the recipient" },
  "step-up": { color: "#fbbf24", text: "ask for stronger authentication (biometrics, token) and show a scam warning" },
  hold: { color: "#fb923c", text: "hold for review / call the customer before sending" },
  block: { color: "#f87171", text: "refuse the payment" },
};

export function RiskDecision() {
  const [profile, setProfile] = useState<Profile>("mule");
  const [x, setX] = useState<RiskInput>({ amount: 900, hour: 22, newDevice: false, firstTimeRecipient: true, nightLimit: 1000, ...PROFILES.mule });
  const d = decide(x);
  const set = (p: Partial<RiskInput>) => setX({ ...x, ...p });

  const pickProfile = (p: Profile) => {
    setProfile(p);
    setX({ ...x, ...PROFILES[p] });
  };

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={profile}
          onChange={pickProfile}
          options={[
            { value: "merchant", label: "established store (PJ)" },
            { value: "person", label: "known person" },
            { value: "mule", label: "fresh account, flagged" },
          ]}
        />
        <Slider label="amount" value={x.amount} min={10} max={10000} step={10} onChange={(v) => set({ amount: v })} format={(v) => brl(v)} className="min-w-56 flex-1" />
        <Slider label="hour" value={x.hour} min={0} max={23} onChange={(v) => set({ hour: v })} format={(v) => `${String(v).padStart(2, "0")}:00`} className="min-w-48 flex-1" />
        <Segmented
          value={x.newDevice ? "new" : "known"}
          onChange={(v) => set({ newDevice: v === "new" })}
          options={[
            { value: "known", label: "registered device" },
            { value: "new", label: "unregistered device" },
          ]}
        />
        <Segmented
          value={x.firstTimeRecipient ? "first" : "seen"}
          onChange={(v) => set({ firstTimeRecipient: v === "first" })}
          options={[
            { value: "first", label: "first time paying them" },
            { value: "seen", label: "paid before" },
          ]}
        />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="Payer PSP: decision before sending the pacs.008">
          <div className="mb-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="rounded-xl px-4 py-3 text-center font-mono text-lg font-semibold text-black uppercase" style={{ background: VERDICT[d.verdict].color }}>
              {d.verdict}
            </div>
            <div className="text-sm text-muted">
              {d.hard ? <span className="text-bad">{d.hard}</span> : <>score {d.score}/100 → {VERDICT[d.verdict].text}</>}
            </div>
          </div>
          {!d.hard && (
            <div className="space-y-1.5">
              {d.factors.length === 0 && <div className="text-sm text-faint">no risk factors</div>}
              {d.factors.map((f) => (
                <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="truncate text-ink">{f.label}</div>
                    <div className="truncate font-mono text-[10.5px] text-faint">{f.source}</div>
                  </div>
                  <div className="h-2 rounded bg-panel-2">
                    <div className="h-full rounded bg-warn" style={{ width: `${Math.min(100, (f.points / 35) * 100)}%` }} />
                  </div>
                  <div className="text-right font-mono text-muted">+{f.points}</div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-faint">
            Try: the flagged fresh account at 22:00 for R$ 900 is refused on DICT signals alone; cancel its marker and set key and account age
            to a few months and watch it fall to step-up or warn. Push the amount above R$ 1,000 at night and the nightly limit refuses it before
            any scoring. Switch to an unregistered device and anything over R$ 200 is refused. The weights are illustrative: the BCB defines
            which data a PSP gets and which hard limits apply, not a formula.
          </p>
        </Panel>
        <div className="min-w-0 space-y-3">
          <Panel title="Recipient, as seen in the DICT" bodyClassName="p-3">
            <div className="space-y-2">
              <Slider label="key age" value={x.keyAgeDays} min={0} max={1000} step={1} onChange={(v) => set({ keyAgeDays: v })} format={(v) => `${v} d`} />
              <Slider label="account age" value={x.accountAgeDays} min={0} max={3000} step={1} onChange={(v) => set({ accountAgeDays: v })} format={(v) => `${v} d`} />
              <Slider label="open reports" value={x.openReports} min={0} max={6} onChange={(v) => set({ openReports: v })} />
              <Slider label="settlements m12" value={x.settlementsM12} min={0} max={5000} step={10} onChange={(v) => set({ settlementsM12: v })} />
            </div>
          </Panel>
          <FraudMarkers
            mule={x.muleD90}
            scammer={x.scammerD90}
            reporters={x.distinctReporters}
            onChange={(m, s, r) => set({ muleD90: m, scammerD90: s, distinctReporters: r })}
          />
        </div>
      </div>
    </div>
  );
}

function FraudMarkers({ mule, scammer, reporters, onChange }: { mule: number; scammer: number; reporters: number; onChange: (m: number, s: number, r: number) => void }) {
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog((l) => [s, ...l].slice(0, 4));
  return (
    <Panel title="Fraud markers on this recipient" bodyClassName="p-3">
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Stat label="mule d90" value={mule} tone={mule ? "bad" : "good"} />
        <Stat label="scammer d90" value={scammer} tone={scammer ? "bad" : "good"} />
        <Stat label="reporters" value={reporters} tone={reporters >= 2 ? "bad" : "neutral"} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          className="px-2 py-0.5 font-mono text-[11px]"
          onClick={() => {
            onChange(mule + 1, scammer, reporters + 1);
            push("another PSP closed a report AGREED · FraudType=MULE_ACCOUNT");
          }}
        >
          + AGREED (MULE_ACCOUNT)
        </Button>
        <Button
          className="px-2 py-0.5 font-mono text-[11px]"
          onClick={() => {
            onChange(mule, scammer + 1, reporters);
            push("own PSP createFraudMarker · SCAMMER_ACCOUNT");
          }}
        >
          + createFraudMarker
        </Button>
        <Button
          className="px-2 py-0.5 font-mono text-[11px]"
          disabled={mule + scammer === 0}
          onClick={() => {
            if (mule > 0) onChange(mule - 1, scammer, Math.max(0, reporters - 1));
            else onChange(mule, scammer - 1, reporters);
            push("user contested; marker cancelled within 7 days (cancelFraudMarker)");
          }}
        >
          cancelFraudMarker
        </Button>
      </div>
      <ol className="mt-2 space-y-0.5 font-mono text-[10.5px] text-faint">
        {log.map((l, i) => (
          <li key={i} className={clsx(i === 0 && "text-muted")}>
            {l}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        A marker stays on the CPF/CNPJ (and key) for 5 years; the marked user may ask for review and the marking PSP must decide within 7 days
        (Res BCB 587/2026). The PSP that accepted a report must refuse Pix to and from that user, except refunds, and the PSP that marked a user must refuse that
        user's key registrations, portabilities and claims (the DICT answers EntryWithFraudRelatedRestriction).
      </p>
    </Panel>
  );
}
