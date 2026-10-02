"use client";

import { useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { SequenceDiagram, type SeqEvent } from "@/components/spi/SequenceDiagram";
import { pacs002 } from "@/components/spi/messages";
import { XmlView } from "@/components/spi/XmlView";
import { PAYEE_PSP, PAYER_PSP, rtrId, SPI_ISPB } from "@/components/spi/xml";
import { ORIGINAL } from "./pacs004";

type Outcome = "ok" | "AM09" | "AC07" | "DT05";

const RTR = rtrId(PAYEE_PSP.ispb, "2026-10-05T10:12:00.000Z", 314);

const LANES = [
  { label: "Remetente", sub: "original receiver" },
  { label: "PSP remetente", sub: PAYEE_PSP.ispb },
  { label: "SPI", sub: "00038166" },
  { label: "PSP destinatário", sub: PAYER_PSP.ispb },
  { label: "Destinatário", sub: "original payer" },
];

function events(o: Outcome): { ev: SeqEvent[]; steps: string[] } {
  const ev: SeqEvent[] = [];
  const steps: string[] = [];
  const add = (e: SeqEvent, step: string) => {
    ev.push(e);
    steps.push(step);
  };
  add({ from: 0, to: 1, label: "return R$ 30,00 of that Pix", tone: "info" }, "1 · The user who received the Pix asks for a devolução (app, or API Pix PUT /pix/{e2eid}/devolucao/{id} for companies).");
  add({ from: 1, to: 1, label: "block R$ 30,00 in remetente's account", tone: "muted" }, "2 · PSP remetente blocks the amount in its customer's account. A return presupposes funds (Regulamento art. 41-A, I).");
  add({ from: 1, to: 2, label: "pacs.004 · MD06", sub: `RtrId ${RTR.slice(0, 13)}…`, tone: "info" }, "3 · It signs and posts a pacs.004 with OrgnlEndToEndId = the payment's id. Primary channel: the original payer expects it promptly.");
  if (o === "DT05") {
    add({ from: 2, to: 2, label: "original Pix is 97 days old > 90", tone: "bad" }, "4 · The SPI checks the return window itself: outside the maximum period of the Pix rules.");
    add({ from: 2, to: 1, label: "pacs.002 RJCT DT05", tone: "bad" }, "5 · RJCT DT05 to the PSP remetente, which unblocks its customer. The destinatário PSP never sees it.");
    add({ from: 1, to: 0, label: "return refused, funds unblocked", tone: "bad" }, "6 · The user is told. To give the money back now they would have to send a new Pix.");
    return { ev, steps };
  }
  add({ from: 2, to: 2, label: "reserve R$ 30,00 in PSP remetente's Conta PI", tone: "muted" }, "4–5 · The SPI validates and reserves the amount in the PSP remetente's Conta PI, exactly as for a payment.");
  add({ from: 2, to: 3, label: "pacs.004", tone: "info" }, "6–7 · The pacs.004 is made available to the PSP destinatário (the original payer's PSP).");
  add({ from: 3, to: 3, label: "look up E2E: date, amount, payer account", tone: "muted" }, "8 · From OrgnlEndToEndId alone it recovers the original date, amount and the payer's account. That is why a pacs.004 carries no party block.");
  if (o === "AM09") {
    add({ from: 3, to: 3, label: "already returned 80 + 30 > 100", tone: "bad" }, "9 · It checks the running total of returns for this EndToEndId: this one would exceed the original amount.");
    add({ from: 3, to: 2, label: "pacs.002 RJCT AM09", tone: "bad" }, "10 · RJCT AM09 (WrongAmount), raised by the PSP that would have been credited.");
    add({ from: 2, to: 1, label: "pacs.002 RJCT AM09", sub: "reserve released", tone: "bad" }, "11 · The SPI releases the reserve and relays the rejection.");
    add({ from: 1, to: 0, label: "return refused, funds unblocked", tone: "bad" }, "12 · The PSP remetente unblocks the customer's funds.");
    return { ev, steps };
  }
  if (o === "AC07") {
    add({ from: 3, to: 3, label: "destinatário's account is closed", tone: "bad" }, "9 · Validation fails: the original payer closed the account.");
    add({ from: 3, to: 2, label: "pacs.002 RJCT AC07", tone: "bad" }, "10 · RJCT AC07. The money stays with the original receiver; what to do next is a matter between the users and PSPs.");
    add({ from: 2, to: 1, label: "pacs.002 RJCT AC07", sub: "reserve released", tone: "bad" }, "11 · The SPI releases the reserve and relays the rejection.");
    add({ from: 1, to: 0, label: "return failed", tone: "bad" }, "12 · The PSP remetente unblocks and informs its customer.");
    return { ev, steps };
  }
  add({ from: 3, to: 3, label: "≤ 90 days, our customer, amount ok, account active → provisional credit", tone: "muted" }, "9–10 · Checks per Manual de Fluxos §4.1: 90-day window, the destinatário is its customer, the amount fits, the account is active. Provisional credit.");
  add({ from: 3, to: 2, label: "pacs.002 ACSP", sub: "OrgnlInstrId = RtrId", tone: "ok" }, "11–12 · ACSP back to the SPI. OrgnlInstrId carries the RtrId, OrgnlEndToEndId the original payment's id.");
  add({ from: 2, to: 2, label: "debit remetente Conta PI, credit destinatário Conta PI", tone: "ok" }, "13 · Settlement: the balances move in the opposite direction from the original Pix.");
  add({ from: 2, to: 3, label: "pacs.002 ACCC", tone: "ok" }, "14–15 · Confirmation to the PSP destinatário…");
  add({ from: 3, to: 4, label: "credit + notify", tone: "ok" }, "16–18 · …which credits the original payer and notifies them.");
  add({ from: 2, to: 1, label: "pacs.002 ACSC", tone: "ok" }, "19–20 · Confirmation to the PSP remetente…");
  add({ from: 1, to: 0, label: "debit + notify", tone: "ok" }, "21–23 · …which debits its customer for good and notifies them.");
  return { ev, steps };
}

export function ReturnFlow() {
  const [o, setO] = useState<Outcome>("ok");
  const [step, setStep] = useState(99);
  const { ev, steps } = useMemo(() => events(o), [o]);
  const shown = Math.min(step, ev.length);
  const last = ev[shown - 1];
  const code = o === "ok" ? undefined : o;
  const xml = useMemo(
    () =>
      pacs002({
        from: o === "ok" || o === "DT05" ? SPI_ISPB : PAYER_PSP.ispb,
        to: o === "ok" || o === "DT05" ? PAYEE_PSP.ispb : SPI_ISPB,
        orgnlInstrId: RTR,
        orgnlE2E: ORIGINAL.e2e,
        sts: o === "ok" ? "ACSC" : "RJCT",
        code,
        creDtTm: "2026-10-05T10:12:03.201Z",
        settledAt: o === "ok" ? "2026-10-05T10:12:03.090Z" : undefined,
        seed: 61,
      }),
    [o, code],
  );

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={o}
          onChange={(v) => {
            setO(v);
            setStep(1);
          }}
          options={[
            { value: "ok", label: "settles" },
            { value: "AM09", label: "too much (AM09)" },
            { value: "AC07", label: "payer account closed" },
            { value: "DT05", label: "day 97 (DT05)" },
          ]}
        />
        <div className="flex gap-2">
          <Button onClick={() => setStep((s) => Math.max(1, Math.min(s, ev.length) - 1))}>◀ Step</Button>
          <Button variant="primary" onClick={() => setStep((s) => Math.min(ev.length, s + 1))}>
            Step ▶
          </Button>
          <Button variant="ghost" onClick={() => setStep(99)}>
            All
          </Button>
        </div>
      </Controls>
      <Panel title={`Devolução between direct participants (Manual de Fluxos §4.1) · ${shown}/${ev.length}`}>
        <SequenceDiagram lanes={LANES} events={ev} shown={shown} active={shown - 1} color={CHAPTER_COLOR.returns} />
        {last && <p className="mt-3 text-[14px] leading-relaxed text-muted">{steps[shown - 1]}</p>}
      </Panel>
      <Panel title={o === "ok" ? "Final pacs.002 to the PSP remetente" : "The rejecting pacs.002"}>
        <XmlView root={xml} compact maxHeight={320} defaultPath="OrgnlInstrId" />
      </Panel>
      <p className="text-xs text-faint">
        Try: step through &quot;settles&quot; and note the mirror image of the payment cycle, with the PSPs&apos; roles swapped. Then compare where AM09 (decided by the
        original payer&apos;s PSP) and DT05 (decided by the SPI before forwarding) stop the flow, and who sends the RJCT.
      </p>
    </div>
  );
}
