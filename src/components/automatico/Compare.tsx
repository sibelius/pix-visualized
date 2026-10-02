"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented } from "@/components/ui";

type Method = "auto" | "debito" | "boleto" | "cartao";
const METHODS: { key: Method; name: string; sub: string }[] = [
  { key: "auto", name: "Pix Automático", sub: "since 16 Jun 2025" },
  { key: "debito", name: "Débito automático", sub: "bank convênio" },
  { key: "boleto", name: "Boleto", sub: "+ DDA" },
  { key: "cartao", name: "Card recurring", sub: "credit card on file" },
];

type Tone = "good" | "mid" | "bad";
type Scenario = { key: string; label: string; cells: Record<Method, [Tone, string]> };

const SCENARIOS: Scenario[] = [
  {
    key: "reach",
    label: "Receiver wants to bill customers of any bank",
    cells: {
      auto: ["good", "One integration with its own PSP (API Pix or arquivo padronizado). Every account-holding Pix participant must offer Pix Automático to payers."],
      debito: ["bad", "Needs a convênio with each payer's bank; in practice only large billers have them."],
      boleto: ["good", "Any bank can pay a boleto; the receiver needs a boleto agreement with its own bank."],
      cartao: ["mid", "Only payers with a card (and enough credit limit); acquirer + gateway contract."],
    },
  },
  {
    key: "small",
    label: "Receiver is an MEI / small company",
    cells: {
      auto: ["good", "Allowed for any CNPJ holder, including MEI and EI. Receiver PSP may charge a fee; payers can never be charged."],
      debito: ["bad", "Rarely available to small billers."],
      boleto: ["mid", "Per-boleto registration/settlement fees from its bank."],
      cartao: ["mid", "Merchant discount rate (MDR) per transaction, set by contract."],
    },
  },
  {
    key: "effort",
    label: "Payer effort each month",
    cells: {
      auto: ["good", "None after the one-time authorization; optional notification when each debit is scheduled."],
      debito: ["good", "None after enrolment."],
      boleto: ["bad", "Must pay every bill (DDA shows it in the app, but the payer still confirms)."],
      cartao: ["good", "None — until the card expires or is replaced."],
    },
  },
  {
    key: "control",
    label: "Payer wants a cap and to cancel in their own app",
    cells: {
      auto: ["good", "Valor máximo per authorization, overdraft on/off, cancel one debit until 23:59 of D-1 or the whole authorization any time — all in the bank app."],
      debito: ["mid", "Cancel at the bank or biller; caps depend on the bank."],
      boleto: ["good", "Nothing happens unless the payer pays."],
      cartao: ["mid", "Cancel with the merchant, or block/replace the card; dispute via chargeback."],
    },
  },
  {
    key: "funds",
    label: "Payer has no balance on the due date",
    cells: {
      auto: ["good", "Window 0h–8h fails → mandatory retry 18h–21h the same day → if the recorrência allows, up to 3 more dates within 7 days (NTAG)."],
      debito: ["mid", "Retries and fees per convênio and bank rules."],
      boleto: ["mid", "Payer pays late with interest/fine, or the boleto expires."],
      cartao: ["mid", "Declined; merchant retries per card-network rules."],
    },
  },
  {
    key: "settle",
    label: "When the receiver has the money",
    cells: {
      auto: ["good", "Instant at settlement (secondary channel, early morning on the scheduled date)."],
      debito: ["mid", "Per convênio, typically not same-instant."],
      boleto: ["mid", "Usually next business day after payment."],
      cartao: ["bad", "Credit-card receivables are paid out in ~30 days unless anticipated (at a cost)."],
    },
  },
  {
    key: "wrong",
    label: "A debit happens that should not have",
    cells: {
      auto: ["good", "If the payer PSP debited outside the authorization (amount, no valid authorization, cancelled schedule) it refunds the payer from its own funds within 24 h, then recovers via MED with reason pix_automatico."],
      debito: ["mid", "Claim with the bank."],
      boleto: ["mid", "Payer initiated it — dispute with the receiver."],
      cartao: ["good", "Chargeback through the card network."],
    },
  },
];

const TONE: Record<Tone, string> = { good: "border-ok/40 bg-ok/5", mid: "border-warn/30 bg-warn/5", bad: "border-bad/40 bg-bad/5" };

export function Compare() {
  const [view, setView] = useState<"grid" | "one">("grid");
  const [sc, setSc] = useState("funds");
  const shown = view === "grid" ? SCENARIOS : SCENARIOS.filter((s) => s.key === sc);
  return (
    <div className="space-y-4">
      <Controls>
        <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "all scenarios" }, { value: "one", label: "one scenario" }]} />
        {view === "one" && <Segmented value={sc} onChange={setSc} options={SCENARIOS.map((s) => ({ value: s.key, label: s.label.split(" ").slice(0, 3).join(" ") + "…" }))} />}
      </Controls>
      <Panel title="Recurring payments in Brazil: same scenario, four rails" bodyClassName="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[180px_repeat(4,1fr)] gap-2 pb-2">
            <span />
            {METHODS.map((m) => (
              <div key={m.key} className={clsx("rounded-md px-2 py-1", m.key === "auto" && "bg-[#34d399]/10")}>
                <div className="text-sm font-semibold">{m.name}</div>
                <div className="text-[11px] text-faint">{m.sub}</div>
              </div>
            ))}
          </div>
          {shown.map((s) => (
            <div key={s.key} className="grid grid-cols-[180px_repeat(4,1fr)] gap-2 border-t border-line py-2">
              <div className="text-[13px] font-medium text-ink">{s.label}</div>
              {METHODS.map((m) => (
                <div key={m.key} className={clsx("rounded-md border px-2 py-1.5 text-[12px] leading-snug text-muted", TONE[s.cells[m.key][0]])}>
                  {s.cells[m.key][1]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: pick &quot;one scenario&quot; and step through them; the Pix Automático column is the only one where every rule (caps, retries, refunds) is fixed by the
        BCB rather than by a bilateral contract. Fees for the other rails vary by contract and are deliberately not quantified here.
      </p>
    </div>
  );
}
