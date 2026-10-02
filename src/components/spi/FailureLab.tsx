"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { SequenceDiagram, type SeqEvent } from "./SequenceDiagram";
import { admi002, pacs002 } from "./messages";
import { XmlView } from "./XmlView";
import { brl, e2eId, msgId, PAYEE_PSP, PAYER_PSP, SPI_ISPB, type XNode } from "./xml";

const E2E = e2eId(PAYER_PSP.ispb, "2026-10-02T14:03:27.780Z", 77);
const AT = "2026-10-02T14:03:29.204Z";

type Scenario = {
  id: string;
  label: string;
  events: SeqEvent[];
  result: string;
  responsible: string;
  contaPi: string;
  terminal: boolean;
  receiverSaw: boolean;
  xml?: () => XNode;
  note: string;
};

const send: SeqEvent = { from: 0, to: 1, label: "pacs.008", sub: `EndToEndId ${E2E.slice(0, 13)}…`, tone: "info" };
const reserve: SeqEvent = { from: 1, to: 1, label: "reserve R$ 150,00 in payer Conta PI", tone: "muted" };
const fwd: SeqEvent = { from: 1, to: 2, label: "pacs.008", tone: "info" };
const release: SeqEvent = { from: 1, to: 1, label: "release reserve", tone: "warn" };

const rjFromReceiver = (code: string, why: string): Pick<Scenario, "events" | "xml"> => ({
  events: [
    send,
    reserve,
    fwd,
    { from: 2, to: 2, label: why, tone: "bad" },
    { from: 2, to: 1, label: `pacs.002 RJCT ${code}`, tone: "bad" },
    release,
    { from: 1, to: 0, label: `pacs.002 RJCT ${code}`, tone: "bad" },
  ],
  xml: () => pacs002({ from: PAYEE_PSP.ispb, to: SPI_ISPB, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "RJCT", code, creDtTm: AT, seed: 3 }),
});

const SCENARIOS: Scenario[] = [
  {
    id: "ok",
    label: "Happy path",
    events: [
      send,
      reserve,
      fwd,
      { from: 2, to: 2, label: "account ok, provisional credit", tone: "muted" },
      { from: 2, to: 1, label: "pacs.002 ACSP", tone: "ok" },
      { from: 1, to: 1, label: "debit payer Conta PI / credit receiver Conta PI", tone: "ok" },
      { from: 1, to: 2, label: "pacs.002 ACCC", tone: "ok" },
      { from: 1, to: 0, label: "pacs.002 ACSC", tone: "ok" },
    ],
    result: "ACSC / ACCC",
    responsible: "—",
    contaPi: "R$ 150,00 moved",
    terminal: true,
    receiverSaw: true,
    xml: () => pacs002({ from: SPI_ISPB, to: PAYER_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "ACSC", creDtTm: AT, settledAt: "2026-10-02T14:03:29.101Z", seed: 4 }),
    note: "The only path where money moves. Finality happens at the instant the SPI changes both Conta PI balances; after that the Pix is irrevocable and can only be undone by a separate pacs.004.",
  },
  {
    id: "AM04",
    label: "Conta PI has no funds",
    events: [send, { from: 1, to: 1, label: "available balance < R$ 150,00", tone: "bad" }, { from: 1, to: 0, label: "pacs.002 RJCT AM04", tone: "bad" }],
    result: "RJCT AM04",
    responsible: "payer PSP (liquidity)",
    contaPi: "nothing reserved",
    terminal: true,
    receiverSaw: false,
    xml: () => pacs002({ from: SPI_ISPB, to: PAYER_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "RJCT", code: "AM04", creDtTm: AT, seed: 5 }),
    note: "The SPI reserves before it forwards. A Conta PI below the amount (or at the minimum operating balance the PSP configured, which gives DS02 instead) means immediate, definitive rejection. The receiver PSP never sees the order. Liquidity is managed by moving funds from the PSP's reserve account through the STR (see the Conta PI chapter).",
  },
  { id: "AC03", label: "Receiver account invalid", ...rjFromReceiver("AC03", "account 48213307 not found"), result: "RJCT AC03", responsible: "payer side data (or stale DICT entry)", contaPi: "reserved, then released", terminal: true, receiverSaw: true, note: "The receiver PSP owns the account check. It answers RJCT instead of ACSP; the SPI releases the reserve and relays the code. Closed account gives AC07, blocked AC06, wrong type AC14." },
  { id: "BE01", label: "CPF ≠ account holder", ...rjFromReceiver("BE01", "CPF does not own the account"), result: "RJCT BE01", responsible: "payer side data", contaPi: "reserved, then released", terminal: true, receiverSaw: true, note: "Cdtr/Id must belong to the holder of CdtrAcct. With manual entry (MANU) a typo here is the usual cause." },
  { id: "RR04", label: "Payer is UN-sanctioned", ...rjFromReceiver("RR04", "payer on CSNU sanctions list"), result: "RJCT RR04", responsible: "receiver PSP (compliance)", contaPi: "reserved, then released", terminal: true, receiverSaw: true, note: "Rejected when the payer is sanctioned by a UN Security Council resolution. If the receiver is the sanctioned one, the catalog says the order must not be rejected on that ground." },
  {
    id: "AB03",
    label: "Receiver PSP times out",
    events: [
      send,
      reserve,
      fwd,
      { from: 2, to: 2, label: "…no answer…", tone: "warn" },
      { from: 1, to: 1, label: "40 s since t0′ → release reserve", tone: "bad" },
      { from: 1, to: 0, label: "pacs.002 RJCT AB03", tone: "bad" },
      { from: 1, to: 2, label: "pacs.002 RJCT AB03", tone: "bad" },
    ],
    result: "RJCT AB03",
    responsible: "receiver PSP (counts against its ANS)",
    contaPi: "reserved, then released",
    terminal: true,
    receiverSaw: true,
    xml: () => pacs002({ from: SPI_ISPB, to: PAYEE_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "RJCT", code: "AB03", creDtTm: AT, seed: 6 }),
    note: "Only the SPI can reject after it has received the order (Manual de Tempos §1.1). Both PSPs are told: the receiver must reverse any provisional credit. A slow receiver hurts the payer's experience, so the receiver's answer time (t3′ − t2) is an SLA indicator: p50 1.4 s, p95 2.3 s.",
  },
  {
    id: "AB11",
    label: "Payer PSP too slow",
    events: [send, { from: 1, to: 1, label: "CreDtTm − AccptncDtTm = 36 s > 34 s", tone: "bad" }, { from: 1, to: 0, label: "pacs.002 RJCT AB11", tone: "bad" }],
    result: "RJCT AB11",
    responsible: "payer PSP",
    contaPi: "nothing reserved",
    terminal: true,
    receiverSaw: false,
    xml: () => pacs002({ from: SPI_ISPB, to: PAYER_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "RJCT", code: "AB11", creDtTm: AT, seed: 7 }),
    note: "For HIGH orders the payer PSP reports its own validation time through AccptncDtTm and CreDtTm. Above 34 s (IN BCB 243 art. 18) the order arrives with too little budget left to settle, so the SPI refuses it outright. A PSP that needs longer for fraud analysis must send NORM · PAGFRD instead.",
  },
  {
    id: "AG12",
    label: "Same settler both sides",
    events: [send, { from: 1, to: 1, label: "DbtrAgt and CdtrAgt share a settler", tone: "bad" }, { from: 1, to: 0, label: "pacs.002 RJCT AG12", tone: "bad" }],
    result: "RJCT AG12",
    responsible: "payer PSP (routing)",
    contaPi: "nothing reserved",
    terminal: true,
    receiverSaw: false,
    xml: () => pacs002({ from: SPI_ISPB, to: PAYER_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "RJCT", code: "AG12", creDtTm: AT, seed: 8 }),
    note: "A Pix between two customers of the same institution, or between two indirect participants with the same settler, never touches the SPI: it is settled in the institution's own books (and reported later, within 30 days).",
  },
  {
    id: "sig",
    label: "Signature invalid",
    events: [send, { from: 1, to: 1, label: "XMLDSig digest/certificate mismatch", tone: "bad" }, { from: 1, to: 0, label: "admi.002", sub: "message rejected, no transaction created", tone: "warn" }, { from: 0, to: 0, label: "fix the signature, resend same EndToEndId", tone: "muted" }],
    result: "admi.002",
    responsible: "payer PSP (signing)",
    contaPi: "nothing reserved",
    terminal: false,
    receiverSaw: false,
    xml: () => admi002({ to: PAYER_PSP.ispb, ref: msgId(PAYER_PSP.ispb, 11), reason: "Assinatura XML inválida", location: "SignatureValue", desc: "Assinatura não confere com digests ou certificado", at: AT, seed: 9 }),
    note: "Schema and signature errors are message-layer errors: the answer is admi.002, not a pacs.002. Nothing was accepted, so the operation does not exist yet; the same EndToEndId can be resent once the message is fixed (as long as the clock still allows it).",
  },
  {
    id: "xsd",
    label: "XML fails the XSD",
    events: [send, { from: 1, to: 1, label: "not valid against pacs.008.spi.1.16", tone: "bad" }, { from: 1, to: 0, label: "admi.002", tone: "warn" }],
    result: "admi.002",
    responsible: "payer PSP",
    contaPi: "nothing reserved",
    terminal: false,
    receiverSaw: false,
    xml: () => admi002({ to: PAYER_PSP.ispb, ref: "RUEkBcEPZ/0RXw6MnruFHGaLlc9V3j7IN", reason: "XML inválido", location: "CdtTrfTxInf/IntrBkSttlmAmt", desc: "Não foi possível interpretar o XML", at: AT, seed: 10 }),
    note: "When the XML cannot even be read, admi.002's RltdRef carries the ICOM storage protocol of the upload rather than a MsgId.",
  },
  {
    id: "dupSame",
    label: "Resend identical e2e",
    events: [send, reserve, fwd, { from: 2, to: 1, label: "pacs.002 ACSP", tone: "ok" }, { from: 1, to: 0, label: "pacs.002 ACSC", tone: "ok" }, { from: 0, to: 1, label: "same pacs.008 again", sub: "response lost? just resend", tone: "info" }, { from: 1, to: 1, label: "EndToEndId seen, content identical", tone: "muted" }, { from: 1, to: 0, label: "same pacs.002 ACSC again", tone: "ok" }],
    result: "same answer",
    responsible: "—",
    contaPi: "moved once",
    terminal: true,
    receiverSaw: true,
    xml: () => pacs002({ from: SPI_ISPB, to: PAYER_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "ACSC", creDtTm: AT, settledAt: "2026-10-02T14:03:29.101Z", seed: 4 }),
    note: "Idempotency (24 h window) replaces a status query: if you are unsure whether an order went through, resend it. An identical operation gets the earlier answer; nothing is processed twice.",
  },
  {
    id: "dupDiff",
    label: "Reuse e2e, other content",
    events: [send, reserve, fwd, { from: 2, to: 1, label: "pacs.002 ACSP", tone: "ok" }, { from: 1, to: 0, label: "pacs.002 ACSC", tone: "ok" }, { from: 0, to: 1, label: "pacs.008, same e2e, R$ 999,00", tone: "warn" }, { from: 1, to: 1, label: "EndToEndId seen, content differs", tone: "bad" }, { from: 1, to: 0, label: "error", tone: "bad" }],
    result: "error",
    responsible: "payer PSP (id generation)",
    contaPi: "moved once (the first)",
    terminal: true,
    receiverSaw: true,
    note: "Same key, different operation: the catalog only says the system must return an error. It does not name a single code for this case, so check the current catalog version. The usual cause is an EndToEndId generator that is not unique within its yyyyMMddHHmm minute.",
  },
];

export function FailureLab() {
  const [id, setId] = useState("AM04");
  const [step, setStep] = useState(99);
  const s = SCENARIOS.find((x) => x.id === id)!;
  const shown = Math.min(step, s.events.length);
  const xml = useMemo(() => s.xml?.(), [s]);

  return (
    <div className="space-y-4">
      <Controls>
        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setId(x.id);
                setStep(1);
              }}
              className={clsx(
                "rounded-md border px-2 py-1 text-xs transition",
                x.id === id ? "border-accent bg-accent/10 text-ink" : "border-line bg-panel-2 text-muted hover:text-ink",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setStep((v) => Math.max(1, Math.min(v, s.events.length) - 1))}>◀ Step</Button>
          <Button variant="primary" onClick={() => setStep((v) => Math.min(s.events.length, v + 1))}>
            Step ▶
          </Button>
          <Button variant="ghost" onClick={() => setStep(99)}>
            All
          </Button>
        </div>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Panel title={`${s.label} · ${shown}/${s.events.length}`}>
          <SequenceDiagram
            lanes={[
              { label: "Payer PSP", sub: PAYER_PSP.ispb },
              { label: "SPI", sub: "00038166" },
              { label: "Receiver PSP", sub: PAYEE_PSP.ispb },
            ]}
            events={s.events}
            shown={shown}
            active={shown - 1}
            color={CHAPTER_COLOR.spi}
            minWidth={480}
          />
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
          <Stat label="result" value={s.result} tone={s.id === "ok" || s.id === "dupSame" ? "good" : s.terminal ? "bad" : "warn"} />
          <Stat label="who is responsible" value={<span className="text-sm">{s.responsible}</span>} />
          <Stat label="Conta PI" value={<span className="text-sm">{s.contaPi}</span>} hint={brl(150)} />
          <Stat label="receiver PSP saw it" value={s.receiverSaw ? "yes" : "no"} tone={s.receiverSaw ? "neutral" : "good"} hint={s.terminal ? "terminal for this e2e" : "not terminal: fix and resend"} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="What happened">
          <p className="text-[14px] leading-relaxed text-muted">{s.note}</p>
        </Panel>
        {xml ? (
          <Panel title="The resulting message">
            <XmlView root={xml} compact maxHeight={300} defaultPath={s.id === "sig" || s.id === "xsd" ? "RjctgPtyRsn" : "TxSts"} />
          </Panel>
        ) : (
          <Panel title="The resulting message">
            <p className="text-sm text-faint">No single message is specified for this case; see the note.</p>
          </Panel>
        )}
      </div>
      <p className="text-xs text-faint">
        Try: compare &quot;Conta PI has no funds&quot; with &quot;Receiver account invalid&quot;: in the first the receiver PSP never knows a Pix was attempted, in the second
        the reserve is taken and released. Then compare &quot;Signature invalid&quot; (admi.002, not terminal) with any pacs.002 RJCT (terminal for that EndToEndId).
      </p>
    </div>
  );
}
