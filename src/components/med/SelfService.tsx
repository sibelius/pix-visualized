"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Panel } from "@/components/ui";
import { XmlView, DICT_DOCS } from "@/components/dict/XmlView";
import { brl } from "./model";

type Tx = { id: string; title: string; who: string; amount: number; date: string; ageDays: number; kind: "pix" | "refund" | "saque"; e2e: string };

const TXS: Tx[] = [
  { id: "a", title: "Pix enviado", who: "Carlos E. Mendes", amount: 4800, date: "02/10 10:14", ageDays: 0, kind: "pix", e2e: "E1234567820261002131412aB3cD4eF5" },
  { id: "b", title: "Pix enviado", who: "Loja Bom Preço", amount: 189.9, date: "30/08 19:02", ageDays: 33, kind: "pix", e2e: "E12345678202608302202x9Y8w7V6u5T" },
  { id: "c", title: "Devolução debitada (MED)", who: "Ana B. Lima", amount: 600, date: "10/09 08:40", ageDays: 22, kind: "refund", e2e: "D9999901120260910114000kLmNoPqRs" },
  { id: "d", title: "Pix enviado", who: "Marcos Vieira", amount: 950, date: "20/06 15:31", ageDays: 104, kind: "pix", e2e: "E12345678202606201831pQ1rS2tU3vW" },
  { id: "e", title: "Pix Saque", who: "Mercado Central", amount: 300, date: "28/09 12:05", ageDays: 4, kind: "saque", e2e: "E12345678202609281505aA1bB2cC3dD" },
];

type Answer = { id: string; label: string; situation?: "SCAM" | "ACCOUNT_TAKEOVER" | "COERCION" | "FRAUDULENT_ACCESS" | "OTHER"; reject?: string };

const ANSWERS: Answer[] = [
  { id: "scam", label: "I was deceived (fake seller, fake relative, fake bank employee…)", situation: "SCAM" },
  { id: "takeover", label: "I did not make this Pix, someone used my account without my password", situation: "ACCOUNT_TAKEOVER" },
  { id: "access", label: "Someone got my password/phone and made the Pix", situation: "FRAUDULENT_ACCESS" },
  { id: "coercion", label: "I was forced to send it (kidnapping, threats)", situation: "COERCION" },
  { id: "other", label: "Another kind of fraud", situation: "OTHER" },
  { id: "dispute", label: "The product arrived late / was different / I regret it", reject: "Commercial disputes are not MED cases: they go to the seller or to the courts." },
  { id: "mistake", label: "I sent it to the wrong person by mistake", reject: "A Pix sent by mistake is not fraud: ask the receiver to return it (devolução by the receiver)." },
];

export function SelfService() {
  const [step, setStep] = useState<"list" | "ask" | "done" | "refused">("list");
  const [tx, setTx] = useState<Tx | null>(null);
  const [ans, setAns] = useState<Answer | null>(null);
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");

  const pick = (t: Tx) => {
    setTx(t);
    if (t.kind === "saque") {
      setWhy("The MED does not apply to Pix Saque, nor to the cash part of a Pix Troco (Regulamento art. 41-B §2).");
      setStep("refused");
    } else if (t.ageDays > 80) {
      setWhy(`This Pix is ${t.ageDays} days old. The deadline to contest through the MED is 80 days.`);
      setStep("refused");
    } else setStep("ask");
  };
  const answer = (a: Answer) => {
    setAns(a);
    if (a.reject) {
      setWhy(a.reject);
      setStep("refused");
    }
  };
  const submit = () => setStep("done");
  const reset = () => {
    setStep("list");
    setTx(null);
    setAns(null);
    setText("");
    setWhy("");
  };

  const xml =
    step === "done" && tx && ans?.situation
      ? [
          `<CreateFundsRecoveryRequest>`,
          `    <Signature>…</Signature>`,
          `    <Participant>12345678</Participant>`,
          `    <FundsRecovery>`,
          `        <RootTransactionId>${tx.e2e}</RootTransactionId>`,
          `        <SituationType>${tx.kind === "refund" ? "OTHER" : ans.situation}</SituationType>`,
          ans.situation === "OTHER" || tx.kind === "refund"
            ? `        <ReportDetails>${(text || (tx.kind === "refund" ? "Cliente contesta devolução: pagador original abriu MED de má-fé após receber o produto." : "")).slice(0, 2000)}</ReportDetails>`
            : null,
          `        <ContactInformation>`,
          `            <Email>antifraude@bancoexemplo.com.br</Email>`,
          `            <Phone>+5511300000000</Phone>`,
          `        </ContactInformation>`,
          `    </FundsRecovery>`,
          `</CreateFundsRecoveryRequest>`,
        ]
          .filter(Boolean)
          .join("\n")
      : `<!-- the app sends this to the DICT as soon as the user confirms -->`;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[32px] border-2 border-line bg-bg p-3 shadow-lg">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-line" />
          <div className="min-h-[460px] rounded-2xl bg-panel p-3 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Pix · {step === "list" ? "Contest a Pix" : step === "ask" ? "What happened?" : step === "done" ? "Request received" : "Not eligible"}</span>
              {step !== "list" && (
                <button type="button" onClick={reset} className="text-xs text-muted hover:text-ink">
                  ← back
                </button>
              )}
            </div>
            {step === "list" && (
              <ul className="space-y-1.5">
                {TXS.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => pick(t)} className="w-full rounded-xl border border-line bg-panel-2 px-3 py-2 text-left hover:border-faint">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-ink">{t.title}</span>
                        <span className={clsx("font-mono", t.kind === "refund" ? "text-warn" : "text-ink")}>−{brl(t.amount)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-faint">
                        <span>{t.who}</span>
                        <span>{t.date}</span>
                      </div>
                    </button>
                  </li>
                ))}
                <li className="pt-1 text-[11px] text-faint">Pick the transaction you want to contest.</li>
              </ul>
            )}
            {step === "ask" && tx && (
              <div className="space-y-1.5">
                <div className="mb-2 rounded-lg bg-panel-2 px-3 py-2 text-xs text-muted">
                  {tx.title} · {tx.who} · <span className="font-mono text-ink">{brl(tx.amount)}</span>
                </div>
                {ANSWERS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => answer(a)}
                    className={clsx("w-full rounded-lg border px-3 py-1.5 text-left text-xs", ans?.id === a.id ? "border-accent text-ink" : "border-line text-muted hover:border-faint")}
                  >
                    {a.label}
                  </button>
                ))}
                {ans?.situation === "OTHER" && (
                  <textarea
                    value={text}
                    maxLength={2000}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Describe what happened (up to 2,000 characters)"
                    className="mt-1 h-20 w-full rounded-lg border border-line bg-bg p-2 text-xs text-ink"
                  />
                )}
                <Button variant="primary" onClick={submit} disabled={!ans?.situation || (ans.situation === "OTHER" && !text.trim())} className="mt-2 w-full justify-center">
                  Contest this Pix
                </Button>
              </div>
            )}
            {step === "done" && tx && (
              <div className="space-y-2 text-xs text-muted">
                <div className="rounded-lg border border-ok/40 bg-ok/5 px-3 py-2 text-ok">Protocol MED-2026-1002-000417</div>
                <p>We notified the receiver&apos;s institution, which must block the amount and analyse it within 7 days.</p>
                <p>The money comes back only if there is balance in the accounts it went to. You can follow the status here: em análise → aprovada / rejeitada / cancelada.</p>
                <p>Total answer time: up to 7 days of analysis + up to 72 h for us + up to 6 h per returning institution.</p>
              </div>
            )}
            {step === "refused" && (
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-warn">{why}</div>
                <p className="text-muted">The app still offers the regular support channel and, if unresolved, a complaint at the Banco Central.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <Panel title="What the app sends: POST /api/v2/funds-recoveries/">
          <XmlView xml={xml} docs={{ ...DICT_DOCS, ...SS_DOCS }} highlight={["SituationType", "RootTransactionId"]} maxHeight={320} />
          <p className="mt-2 text-xs text-faint">
            Try: contest the 4,800 Pix as &quot;deceived&quot; (SCAM) and look at the request. Then try the 104-day-old Pix, the Pix Saque, and the
            &quot;product arrived late&quot; answer: the triage refuses them before anything reaches the DICT. The devolução debited 22 days ago can be
            contested: since 01/09/2026 that window is also 80 days (it was 30).
          </p>
        </Panel>
        <Panel title="Rules behind the screen">
          <ul className="space-y-1.5 text-sm text-muted">
            <li>
              Mandatory for apps serving individuals since <span className="text-ink">1 Oct 2025</span> (Requisitos Mínimos para a Experiência do Usuário,
              chapter 16; reworked with a triage step in v7.4, IN BCB 774/2026). It reportedly tripled monthly disputes.
            </li>
            <li>The PSP must not judge merit or ask for a police report before opening: open first (recommended ≤ 10 min, ≤ 30 min p95), analyse after.</li>
            <li>The user picks from the DICT&apos;s SituationType list; &quot;other&quot; requires a description of up to 2,000 characters.</li>
            <li>The screen must show the protocol, the deadline, that recovery depends on balance, and that the receiver&apos;s PSP is notified.</li>
            <li>Contesting a devolução is allowed (the receiver claims the original payer abused the MED); its SituationType is OTHER with details.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

const SS_DOCS: Record<string, string> = {
  CreateFundsRecoveryRequest: "Opens the Recuperação de Valores. One per transaction, ever: even a cancelled one blocks a second attempt (FundsRecoveryForTransactionAlreadyExists).",
  FundsRecovery: "The case object.",
  RootTransactionId: "EndToEndId (E…) of the contested pacs.008, or the RtrId (D…) of a contested pacs.004.",
  SituationType: "SCAM, ACCOUNT_TAKEOVER, COERCION, FRAUDULENT_ACCESS or OTHER, chosen by the user in the app.",
  ReportDetails: "Up to 2,000 characters; mandatory with OTHER (and always for a contested devolução).",
  ContactInformation: "The PSP's fraud-desk contacts, mandatory.",
  Email: "Fraud desk e-mail.",
  Phone: "Fraud desk phone.",
};
