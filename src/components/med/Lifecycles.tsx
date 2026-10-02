"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Panel } from "@/components/ui";
import { XmlView, DICT_DOCS } from "@/components/dict/XmlView";

type FR = "—" | "CREATED" | "TRACKED" | "AWAITING_ANALYSIS" | "ANALYSED" | "REFUNDING" | "COMPLETED" | "CANCELLED";
type IR = "—" | "OPEN" | "ACKNOWLEDGED" | "CLOSED" | "CANCELLED";
type RF = "—" | "OPEN" | "CLOSED" | "CANCELLED";
type FM = "—" | "REGISTERED" | "CANCELLED";

type S = { fr: FR; ir: IR; rf: RF; fm: FM; result?: "AGREED" | "DISAGREED"; events: string[]; xml: string; hl: string[] };

const SITUATIONS = ["SCAM", "ACCOUNT_TAKEOVER", "COERCION", "FRAUDULENT_ACCESS", "OTHER"] as const;
const FRAUD_TYPES = ["MULE_ACCOUNT", "SCAMMER_ACCOUNT", "APPLICATION_FRAUD", "OTHER"] as const;
const REFUND_RESULTS = ["TOTALLY_ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED"] as const;
const REJECTIONS = ["NO_BALANCE", "ACCOUNT_CLOSURE", "OTHER"] as const;

const E2E = "E1234567820261002143712aB3cD4eF5";
const FRID = "ca1b9c01-ff9e-4a58-90ab-d31512e15ce0";
const IRID = "91d65e98-97c0-4b0f-b577-73625da1f9fc";
const RFID = "5e4d3c2b-1a09-4f8e-9d7c-6b5a4e3d2c1b";

const MED_DOCS: Record<string, string> = {
  ...DICT_DOCS,
  CreateFundsRecoveryRequest: "Opens a Recuperação de Valores (MED 2.0). Only the payer PSP of the root transaction may create it, at most once per transaction, ever.",
  FundsRecovery: "The recovery case. Status CREATED → TRACKED → AWAITING_ANALYSIS → ANALYSED → REFUNDING → COMPLETED, or CANCELLED.",
  RootTransactionId: "EndToEndId of the contested pacs.008 (or RtrId of a contested pacs.004). Must be ≤ 80 days old.",
  SituationType: "Why it is fraud: SCAM (golpe), ACCOUNT_TAKEOVER (no authentication), COERCION, FRAUDULENT_ACCESS (stolen credentials), OTHER (needs ReportDetails).",
  ReportDetails: "Free text up to 2,000 chars. Mandatory if SituationType=OTHER.",
  ContactInformation: "E-mail and phone of the payer PSP's fraud desk, mandatory, so receiving PSPs can ask questions.",
  Email: "Contact e-mail of the responsible area.",
  Phone: "Contact phone (E.164).",
  TrackingGraphParameters: "Optional knobs for the tracking graph: MinTransactionAmount, MaxTransactions, HopWindow, MaxHops.",
  MinTransactionAmount: "Smallest outgoing transaction that will be followed.",
  MaxTransactions: "Cap on transactions in the graph.",
  HopWindow: "ISO 8601 duration: how long after money enters an account an outgoing Pix still counts as the next hop.",
  MaxHops: "Graph depth; the root is layer 1.",
  CloseInfractionReportRequest: "Receiver PSP's verdict on one infraction report (status must be ACKNOWLEDGED).",
  InfractionReportId: "Id of the notificação de infração.",
  AnalysisResult: "AGREED (fraud confirmed, keep funds blocked) or DISAGREED (release funds).",
  FraudType: "Mandatory when AGREED: MULE_ACCOUNT, SCAMMER_ACCOUNT, APPLICATION_FRAUD or OTHER. Becomes the fraud marker's type.",
  AnalysisDetails: "Free text for the counterparty.",
  CloseRefundRequest: "Receiver PSP closes a refund request after returning (or failing to return) the money.",
  RefundId: "Id of the solicitação de devolução.",
  RefundAnalysisResult: "TOTALLY_ACCEPTED, PARTIALLY_ACCEPTED or REJECTED.",
  RefundRejectionReason: "Mandatory if REJECTED: NO_BALANCE, ACCOUNT_CLOSURE, INVALID_REQUEST (operational flaw only), OTHER.",
  RefundTransactionId: "The RtrId of the pacs.004 (root) or EndToEndId of the pacs.008 IPRT (subsequent hops) that returned the money.",
  EffectiveRefundedAmount: "What was really returned. The DICT subtracts it from what is still owed to the victim.",
  ListEventNotificationsResponse: "Pull-only events, 7-day window, cursor paging, up to 200 per page.",
  EventNotification: "One event: FUNDS_RECOVERY_ANALYSED, _COMPLETED, _INFORMATION_UPDATED or _CANCELLED.",
  Event: "Event type.",
  EntityType: "Currently only FUNDS_RECOVERY.",
  EntityId: "Id of the funds recovery.",
  Participant: "ISPB of the participant.",
  RefundFundsRecoveryRequest: "Payer PSP starts the refund stage (status must be ANALYSED, within 72 h).",
  FundsRecoveryId: "Id of the recovery the operation refers to.",
  CancelFundsRecoveryRequest: "Only the creator may cancel; it cancels every linked infraction report and open refund request, and the fraud markers they created. Final: no new recovery for the same transaction.",
};

const init = (): S => ({ fr: "—", ir: "—", rf: "—", fm: "—", events: [], xml: "<!-- start by opening a funds recovery -->", hl: [] });

function Machine({ title, states, cur, color }: { title: string; states: string[]; cur: string; color: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">{title}</div>
      <div className="flex flex-wrap gap-1">
        {states.map((s) => (
          <span
            key={s}
            className={clsx("rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]", s === cur ? "text-black" : "border-line text-faint")}
            style={s === cur ? { background: s === "CANCELLED" ? "#f87171" : color, borderColor: "transparent" } : undefined}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Lifecycles() {
  const [s, setS] = useState<S>(init);
  const [situation, setSituation] = useState<(typeof SITUATIONS)[number]>("SCAM");
  const [fraudType, setFraudType] = useState<(typeof FRAUD_TYPES)[number]>("MULE_ACCOUNT");
  const [refundResult, setRefundResult] = useState<(typeof REFUND_RESULTS)[number]>("PARTIALLY_ACCEPTED");
  const [rejection, setRejection] = useState<(typeof REJECTIONS)[number]>("NO_BALANCE");

  const event = (e: string) => `${e}`;

  const create = () =>
    setS({
      ...s,
      fr: "AWAITING_ANALYSIS",
      ir: "OPEN",
      events: [...s.events, "createFundsRecovery → CREATED", "DICT tracks → TRACKED", "DICT opens infraction reports → AWAITING_ANALYSIS"],
      hl: ["RootTransactionId", "SituationType"],
      xml: [
        `<CreateFundsRecoveryRequest>`,
        `    <Signature>…</Signature>`,
        `    <Participant>12345678</Participant>`,
        `    <FundsRecovery>`,
        `        <RootTransactionId>${E2E}</RootTransactionId>`,
        `        <SituationType>${situation}</SituationType>`,
        situation === "OTHER" ? `        <ReportDetails>Vítima relata golpe do falso parente por aplicativo de mensagens.</ReportDetails>` : null,
        `        <ContactInformation>`,
        `            <Email>antifraude@bancoexemplo.com.br</Email>`,
        `            <Phone>+5511300000000</Phone>`,
        `        </ContactInformation>`,
        `    </FundsRecovery>`,
        `    <TrackingGraphParameters>`,
        `        <MinTransactionAmount>200.00</MinTransactionAmount>`,
        `        <MaxTransactions>5</MaxTransactions>`,
        `        <HopWindow>PT2H</HopWindow>`,
        `        <MaxHops>2</MaxHops>`,
        `    </TrackingGraphParameters>`,
        `</CreateFundsRecoveryRequest>`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

  const ack = () =>
    setS({
      ...s,
      ir: "ACKNOWLEDGED",
      events: [...s.events, "receiver acknowledgeInfractionReport → ACKNOWLEDGED; blocks the funds"],
      hl: ["InfractionReportId"],
      xml: [`<AcknowledgeInfractionReportRequest>`, `    <Signature>…</Signature>`, `    <InfractionReportId>${IRID}</InfractionReportId>`, `    <Participant>99999013</Participant>`, `</AcknowledgeInfractionReportRequest>`].join("\n"),
    });

  const close = (result: "AGREED" | "DISAGREED") =>
    setS({
      ...s,
      ir: "CLOSED",
      result,
      fm: result === "AGREED" ? "REGISTERED" : s.fm,
      fr: result === "AGREED" ? "ANALYSED" : "COMPLETED",
      events: [
        ...s.events,
        `receiver closeInfractionReport · ${result}${result === "AGREED" ? ` · FraudType=${fraudType} → fraud marker REGISTERED` : " → funds released"}`,
        result === "AGREED" ? event("event FUNDS_RECOVERY_ANALYSED") : event("root DISAGREED → event FUNDS_RECOVERY_COMPLETED"),
      ],
      hl: ["AnalysisResult", "FraudType"],
      xml: [
        `<CloseInfractionReportRequest>`,
        `    <Signature>…</Signature>`,
        `    <InfractionReportId>${IRID}</InfractionReportId>`,
        `    <Participant>99999013</Participant>`,
        result === "AGREED" ? `    <FraudType>${fraudType}</FraudType>` : null,
        `    <AnalysisResult>${result}</AnalysisResult>`,
        `    <AnalysisDetails>${result === "AGREED" ? "Conta aberta há 3 dias, recursos pulverizados em minutos. Saldo bloqueado." : "Recebedor comprovou venda legítima com entrega."}</AnalysisDetails>`,
        `</CloseInfractionReportRequest>`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

  const refund = () =>
    setS({
      ...s,
      fr: "REFUNDING",
      rf: "OPEN",
      events: [...s.events, "payer refundFundsRecovery → REFUNDING; DICT opens refund request #1 (root)"],
      hl: ["FundsRecoveryId"],
      xml: [`<RefundFundsRecoveryRequest>`, `    <Signature>…</Signature>`, `    <FundsRecoveryId>${FRID}</FundsRecoveryId>`, `    <Participant>12345678</Participant>`, `</RefundFundsRecoveryRequest>`].join("\n"),
    });

  const closeRefund = () =>
    setS({
      ...s,
      rf: "CLOSED",
      fr: "COMPLETED",
      events: [...s.events, `receiver closeRefund · ${refundResult}${refundResult === "REJECTED" ? ` · ${rejection}` : ""}`, "event FUNDS_RECOVERY_COMPLETED"],
      hl: ["RefundAnalysisResult", "EffectiveRefundedAmount", "RefundTransactionId"],
      xml: [
        `<CloseRefundRequest>`,
        `    <Signature>…</Signature>`,
        `    <RefundId>${RFID}</RefundId>`,
        `    <Participant>99999013</Participant>`,
        `    <RefundAnalysisResult>${refundResult}</RefundAnalysisResult>`,
        refundResult === "REJECTED" ? `    <RefundRejectionReason>${rejection}</RefundRejectionReason>` : null,
        refundResult !== "REJECTED" ? `    <RefundTransactionId>D9999901320261004101500aB3cD4eF5</RefundTransactionId>` : null,
        `    <EffectiveRefundedAmount>${refundResult === "TOTALLY_ACCEPTED" ? "4800.00" : refundResult === "PARTIALLY_ACCEPTED" ? "1730.00" : "0.00"}</EffectiveRefundedAmount>`,
        `</CloseRefundRequest>`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

  const cancel = () =>
    setS({
      ...s,
      fr: "CANCELLED",
      ir: s.ir === "—" ? "—" : "CANCELLED",
      rf: s.rf === "OPEN" ? "CANCELLED" : s.rf,
      fm: s.fm === "REGISTERED" ? "CANCELLED" : s.fm,
      events: [...s.events, "payer cancelFundsRecovery → everything linked is cancelled", "event FUNDS_RECOVERY_CANCELLED"],
      hl: ["FundsRecoveryId"],
      xml: [`<CancelFundsRecoveryRequest>`, `    <Signature>…</Signature>`, `    <FundsRecoveryId>${FRID}</FundsRecoveryId>`, `    <Participant>12345678</Participant>`, `</CancelFundsRecoveryRequest>`].join("\n"),
    });

  const eventsXml = () =>
    setS({
      ...s,
      hl: ["Event"],
      xml: [
        `<ListEventNotificationsResponse>`,
        `    <Signature>…</Signature>`,
        `    <HasMoreElements>false</HasMoreElements>`,
        `    <EventNotifications>`,
        ...s.events
          .filter((e) => e.includes("event "))
          .map((e, i) =>
            [
              `        <EventNotification>`,
              `            <Id>${10000 + i}</Id>`,
              `            <Event>${e.split("event ")[1]}</Event>`,
              `            <EntityType>FUNDS_RECOVERY</EntityType>`,
              `            <EntityId>${FRID}</EntityId>`,
              `            <Timestamp>2026-10-0${3 + i}T10:00:00.000Z</Timestamp>`,
              `            <Participant>12345678</Participant>`,
              `        </EventNotification>`,
            ].join("\n"),
          ),
        `    </EventNotifications>`,
        `</ListEventNotificationsResponse>`,
      ].join("\n"),
    });

  const terminal = s.fr === "COMPLETED" || s.fr === "CANCELLED";
  const sel = "rounded-lg border border-line bg-bg px-2 py-1 font-mono text-[11px] text-ink";

  return (
    <div className="space-y-4">
      <Panel title="Four objects, four state machines">
        <div className="grid gap-4 sm:grid-cols-2">
          <Machine title="FundsRecovery (recuperação de valores)" states={["CREATED", "TRACKED", "AWAITING_ANALYSIS", "ANALYSED", "REFUNDING", "COMPLETED", "CANCELLED"]} cur={s.fr} color="#32bcad" />
          <Machine title="InfractionReport (notificação de infração)" states={["OPEN", "ACKNOWLEDGED", "CLOSED", "CANCELLED"]} cur={s.ir} color="#fbbf24" />
          <Machine title="Refund (solicitação de devolução)" states={["OPEN", "CLOSED", "CANCELLED"]} cur={s.rf} color="#34d399" />
          <Machine title="FraudMarker (marcação de fraude)" states={["REGISTERED", "CANCELLED"]} cur={s.fm} color="#f87171" />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Act" right={<Button variant="ghost" onClick={() => setS(init())}>Reset</Button>}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-ok">payer PSP</span>
              <select value={situation} onChange={(e) => setSituation(e.target.value as (typeof SITUATIONS)[number])} className={sel}>
                {SITUATIONS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <Button onClick={create} disabled={s.fr !== "—"} className="px-2 py-0.5 font-mono text-[11px]">
                createFundsRecovery
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-warn">receiver PSP</span>
              <Button onClick={ack} disabled={s.ir !== "OPEN" || terminal} className="px-2 py-0.5 font-mono text-[11px]">
                acknowledge
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-warn">receiver PSP</span>
              <select value={fraudType} onChange={(e) => setFraudType(e.target.value as (typeof FRAUD_TYPES)[number])} className={sel}>
                {FRAUD_TYPES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <Button onClick={() => close("AGREED")} disabled={s.ir !== "ACKNOWLEDGED" || terminal} className="px-2 py-0.5 font-mono text-[11px]">
                close · AGREED
              </Button>
              <Button onClick={() => close("DISAGREED")} disabled={s.ir !== "ACKNOWLEDGED" || terminal} className="px-2 py-0.5 font-mono text-[11px]">
                close · DISAGREED
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-ok">payer PSP</span>
              <Button onClick={refund} disabled={s.fr !== "ANALYSED"} className="px-2 py-0.5 font-mono text-[11px]">
                refundFundsRecovery
              </Button>
              <Button onClick={cancel} disabled={s.fr === "—" || s.fr === "CANCELLED"} className="px-2 py-0.5 font-mono text-[11px]">
                cancelFundsRecovery
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-warn">receiver PSP</span>
              <select value={refundResult} onChange={(e) => setRefundResult(e.target.value as (typeof REFUND_RESULTS)[number])} className={sel}>
                {REFUND_RESULTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              {refundResult === "REJECTED" && (
                <select value={rejection} onChange={(e) => setRejection(e.target.value as (typeof REJECTIONS)[number])} className={sel}>
                  {REJECTIONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              )}
              <Button onClick={closeRefund} disabled={s.rf !== "OPEN"} className="px-2 py-0.5 font-mono text-[11px]">
                closeRefund
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted">both</span>
              <Button onClick={eventsXml} disabled={!s.events.some((e) => e.includes("event "))} className="px-2 py-0.5 font-mono text-[11px]">
                GET /event-notifications
              </Button>
            </div>
          </div>
          <ol className="mt-4 space-y-1 border-t border-line pt-3 font-mono text-[11px] text-muted">
            {s.events.length === 0 && <li className="text-faint">no calls yet</li>}
            {s.events.map((e, i) => (
              <li key={i} className={e.includes("event ") ? "text-accent" : undefined}>
                {i + 1}. {e}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-faint">
            Try: open, acknowledge, close AGREED, refund, close the refund PARTIALLY_ACCEPTED. Then reset and cancel the recovery after the
            receiver agreed: the fraud marker it created disappears with it, which is why a payer PSP that finds the complaint was false must
            cancel even after the money came back.
          </p>
        </Panel>
        <Panel title="Last request on the wire">
          <XmlView xml={s.xml} docs={MED_DOCS} highlight={s.hl} maxHeight={460} />
        </Panel>
      </div>
    </div>
  );
}
