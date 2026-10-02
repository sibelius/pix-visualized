"use client";

import { useState } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui";
import { XmlView } from "@/components/spi/XmlView";
import { x, type XNode } from "@/components/spi/xml";
import { ORIGINAL } from "./pacs004";

type Row = { k: string; v: string; good?: boolean; bad?: boolean };
type Case = { id: string; label: string; who: string; msg: string; rows: Row[]; xml: XNode; note: string };

const ROOT = ORIGINAL.e2e;

const CASES: Case[] = [
  {
    id: "return",
    label: "Refund with pacs.004",
    who: "receiver asks its PSP for a devolução",
    msg: "pacs.004 · MD06",
    rows: [
      { k: "linked to the original", v: "OrgnlEndToEndId", good: true },
      { k: "capped at original amount", v: "yes, across all partial returns (AM09)", good: true },
      { k: "window", v: "90 days (DT05)" },
      { k: "needs payer's key/account", v: "no: resolved from the EndToEndId", good: true },
      { k: "payer sees", v: "a devolução of their Pix", good: true },
    ],
    xml: x("TxInf", [x("RtrId", "D55667788202610051012abcDEF12345", "The return's own id."), x("OrgnlEndToEndId", ROOT, "The link: this is what makes it a return."), x("RtrRsnInf", [x("Rsn", [x("Cd", "MD06", "Refund requested by end customer.")])])]),
    note: "The scheme's tool for giving money back. Every PSP involved can relate the return to the payment: the payer's PSP shows it as a refund, keeps the running total, and the original transaction's record is complete.",
  },
  {
    id: "newpix",
    label: "Refund with a new pacs.008",
    who: "merchant just sends the customer a Pix",
    msg: "pacs.008 · IPAY",
    rows: [
      { k: "linked to the original", v: "no", bad: true },
      { k: "capped at original amount", v: "no: nothing stops refunding twice", bad: true },
      { k: "window", v: "none" },
      { k: "needs payer's key/account", v: "yes: a key (DICT) or the account data", bad: true },
      { k: "payer sees", v: "an unrelated incoming Pix", bad: true },
    ],
    xml: x("CdtTrfTxInf", [x("PmtId", [x("EndToEndId", "E55667788202610051012zyXWV987654", "A brand-new payment id, unrelated to the original.")]), x("Purp", [x("Cd", "IPAY", "Just a transfer.")]), x("CdtrAcct", [x("Prxy", [x("Id", "+5511912345678", "Must know a key or the account.")])])]),
    note: "It moves money, but the payment it compensates is still, in the eyes of every system, unrefunded. Reconciliation breaks on both sides, the customer may still dispute the original (MED) and get paid twice, and the DICT lookup it needs counts against anti-scraping token buckets.",
  },
  {
    id: "fr01",
    label: "MED: root account still has the money",
    who: "receiver PSP after a fraud claim",
    msg: "pacs.004 · FR01",
    rows: [
      { k: "linked to the original", v: "OrgnlEndToEndId", good: true },
      { k: "capped at original amount", v: "yes", good: true },
      { k: "window", v: "MED timeline (claim within 80 days; 7 d analysis, 72 h, 6 h)" },
      { k: "needs payer's key/account", v: "no", good: true },
      { k: "payer sees", v: "a fraud return", good: true },
    ],
    xml: x("TxInf", [x("RtrId", "D55667788202610121530fraudR00001", "Return id; reported back to DICT as RefundTransactionId."), x("OrgnlEndToEndId", ROOT, "The root transaction of the MED case."), x("RtrRsnInf", [x("Rsn", [x("Cd", "FR01", "Well-founded suspicion of fraud.")])])]),
    note: "When the funds are still in the account that received the fraudulent Pix, the receiver PSP debits them and returns with a pacs.004 coded FR01 (BE08 for operational failures). See the MED chapter for the infraction and recovery flow.",
  },
  {
    id: "iprt",
    label: "MED 2.0: money already moved on",
    who: "PSP of a later hop in the fraud chain",
    msg: "pacs.008 · IPRT",
    rows: [
      { k: "linked to the original", v: "PmtId/InstrId = root EndToEndId", good: true },
      { k: "capped at original amount", v: "by the MED recovery, not by a pacs.004 total" },
      { k: "window", v: "MED recovery timeline" },
      { k: "needs payer's key/account", v: "data of the original payer, from the MED case" },
      { k: "payer sees", v: "MED recovery" },
    ],
    xml: x("CdtTrfTxInf", [
      x("PmtId", [x("InstrId", ROOT, "idTransacaoRaizContestacao: the root of the MED case."), x("EndToEndId", "E99887766202610131100hopRet00001", "A new payment id.")]),
      x("MndtRltdInf", [x("Tp", [x("LclInstrm", [x("Prtry", "MANU", "Must be MANU for IPRT (and GrpHdr InstrPrty must be HIGH).")])])]),
      x("Dbtr", [x("Nm", "Banco Terceiro S.A.", "The PSP itself is the payer: it debits its customer and pays from its own account.")]),
      x("Purp", [x("Cd", "IPRT", "Instant payments return (MED 2.0).")]),
    ]),
    note: "A pacs.004 can only return a payment to the PSP that sent it. When fraud money was split across further accounts, those later PSPs did not receive the root Pix, so they pay back with a pacs.008 whose purpose is IPRT and whose InstrId names the root transaction.",
  },
  {
    id: "undo",
    label: "Undo a fraudulent return",
    who: "after a MED case is cancelled",
    msg: "pacs.008",
    rows: [
      { k: "linked to the original", v: "through the MED case" },
      { k: "capped at original amount", v: "n/a" },
      { k: "window", v: "n/a" },
      { k: "why not pacs.004", v: "returning a return is forbidden (AG13)", bad: true },
      { k: "payer sees", v: "a payment" },
    ],
    xml: x("CdtTrfTxInf", [x("PmtId", [x("EndToEndId", "E11223344202610201000undoRet0001", "New payment id.")]), x("Purp", [x("Cd", "IPAY", "An ordinary payment purpose.")])]),
    note: "If money returned under MED has to go back (the payer PSP cancels the recovery because it was not fraud), the PSP that received the return cannot send a pacs.004 against a return. It sends a new pacs.008 instead.",
  },
  {
    id: "refu",
    label: "Pix Automático MED refund",
    who: "receiver PSP reimbursing the payer's PSP",
    msg: "pacs.008 · REFU",
    rows: [
      { k: "linked to the original", v: "through the MED case" },
      { k: "capped at original amount", v: "total or partial refund" },
      { k: "window", v: "MED timeline" },
      { k: "parties", v: "Dbtr = original receiver; Cdtr = payer's PSP (CNPJ)" },
      { k: "payer sees", v: "nothing new: their PSP already paid them" },
    ],
    xml: x("CdtTrfTxInf", [x("Purp", [x("Cd", "REFU", "Refund to the payer's PSP, which had reimbursed its user from its own funds.")]), x("MndtRltdInf", [x("Tp", [x("LclInstrm", [x("Prtry", "MANU", "REFU requires MANU and HIGH.")])])])]),
    note: "In Pix Automático the payer's PSP must refund its user from its own money; it then recovers from the receiver's side with a pacs.008 of purpose REFU. The API Pix exposes this as natureza MED_PIX_AUTOMATICO.",
  },
];

export function ReturnVsNewPix() {
  const [id, setId] = useState("return");
  const c = CASES.find((k) => k.id === id)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {CASES.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setId(k.id)}
            className={clsx("rounded-md border px-2.5 py-1 text-xs transition", k.id === id ? "border-accent bg-accent/10 text-ink" : "border-line bg-panel-2 text-muted hover:text-ink")}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={c.label} right={<span className="font-mono text-xs text-accent">{c.msg}</span>}>
          <div className="mb-3 text-[12px] text-faint">{c.who}</div>
          <dl className="divide-y divide-line/60 text-[13px]">
            {c.rows.map((r) => (
              <div key={r.k} className="flex justify-between gap-4 py-1.5">
                <dt className="text-muted">{r.k}</dt>
                <dd className={clsx("text-right", r.good && "text-ok", r.bad && "text-bad", !r.good && !r.bad && "text-ink")}>{r.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">{c.note}</p>
          {(c.id === "fr01" || c.id === "iprt" || c.id === "refu") && (
            <a href="/med" className="mt-2 inline-block text-sm text-accent hover:underline">
              → the MED chapter
            </a>
          )}
        </Panel>
        <Panel title="The fields that make the difference">
          <XmlView root={c.xml} compact maxHeight={300} />
        </Panel>
      </div>
      <p className="text-xs text-faint">Try: flip between &quot;Refund with pacs.004&quot; and &quot;Refund with a new pacs.008&quot; and read the first two rows: the link and the cap are the whole point.</p>
    </div>
  );
}
