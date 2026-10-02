"use client";

import { useState } from "react";
import clsx from "clsx";
import { LineChart } from "@/components/viz/Chart";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import { brl } from "./model";

type Mode = "med" | "cautelar";
type Step = { at: number; who: string; what: string; detail: string; fr?: string; ir?: string; rf?: string; bad?: boolean };

const AMOUNT = 4800;

const fmtH = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} d`;
};

/** report delay slider: 0..100 mapped to 5 minutes .. 90 days on a log scale */
const delayOf = (v: number) => (5 / 60) * Math.pow((90 * 24) / (5 / 60), v / 100);

export function MedClock() {
  const [mode, setMode] = useState<Mode>("med");
  const [rv, setRv] = useState(35);
  const [openMin, setOpenMin] = useState(8);
  const [halfLife, setHalfLife] = useState(45);
  const [analysisDays, setAnalysisDays] = useState(2);
  const [verdict, setVerdict] = useState<"AGREED" | "DISAGREED">("AGREED");
  const [refundDelayH, setRefundDelayH] = useState(12);
  const [idx, setIdx] = useState(0);

  const report = delayOf(rv);
  const left = (h: number) => AMOUNT * Math.pow(0.5, (h * 60) / halfLife);

  const steps: Step[] = [];
  steps.push({ at: 0, who: "fraudster", what: "Pix settles into a mule account", detail: `pacs.008 → ACSC, ${brl(AMOUNT)} credited instantly. The clock starts.` });
  let recovered = 0;
  let blockedAmt = 0;
  if (mode === "cautelar") {
    blockedAmt = AMOUNT;
    steps.push({ at: 0.01, who: "receiver PSP", what: "bloqueio cautelar on the incoming credit", detail: "Its risk engine (DICT statistics: MuleAccounts, OpenReports, account age) flags the credit and blocks it at once. Receiver is notified." });
    steps.push({ at: 0.01 + Math.min(72, analysisDays * 24), who: "receiver PSP", what: verdict === "AGREED" ? "fraud confirmed within 72 h" : "not fraud: funds released", detail: "The cautelar block may last at most 72 h while the PSP analyses.", bad: verdict !== "AGREED" });
    if (verdict === "AGREED") {
      recovered = AMOUNT;
      steps.push({ at: 0.02 + Math.min(72, analysisDays * 24), who: "receiver PSP", what: "pacs.004 with RtrRsnInf/Rsn/Cd = FR01", detail: "Returns the money on its own initiative, then createFraudMarker for its client in the DICT." });
    }
  } else if (report > 80 * 24) {
    steps.push({ at: report, who: "victim", what: "reports the fraud in the app", detail: "Day 80+ after the transaction." });
    steps.push({ at: report + openMin / 60, who: "payer PSP", what: "createFundsRecovery → 400 FundsRecoveryTransactionNotEligible", detail: "The root transaction must be at most 80 days old. Nothing can be done through the MED.", bad: true });
  } else {
    const opened = report + openMin / 60;
    const blockAt = opened + 0.02; // tracking + automatic block, ack ≤ 180 s
    blockedAmt = left(blockAt);
    const analysed = blockAt + analysisDays * 24;
    steps.push({ at: report, who: "victim", what: "contests the Pix in the app (autoatendimento MED)", detail: "Picks the transaction from the statement and the kind of fraud: golpe, invasão, coerção, acesso fraudulento, outro." });
    steps.push({
      at: opened,
      who: "payer PSP",
      what: "POST /funds-recoveries/ (CreateFundsRecovery)",
      detail: `${openMin} min after the complaint. SLA: ≤ 30 min in 95% of cases (BCB recommends ≤ 10). No merit analysis and no police report before opening.`,
      fr: "CREATED → TRACKED",
      bad: openMin > 30,
    });
    steps.push({
      at: blockAt,
      who: "DICT → receiver PSP",
      what: "infraction report (REFUND_REQUEST) → acknowledge → block",
      detail: `Receiver PSP polls, acknowledges (≤ 180 s p95) and blocks min(InfractionAmount, balance) = ${brl(blockedAmt)}: the mule already moved the rest.`,
      fr: "AWAITING_ANALYSIS",
      ir: "OPEN → ACKNOWLEDGED",
    });
    steps.push({
      at: analysed,
      who: "receiver PSP",
      what: `closeInfractionReport · AnalysisResult=${verdict}`,
      detail:
        verdict === "AGREED"
          ? "Fraud confirmed: FraudType (e.g. MULE_ACCOUNT) is mandatory and a fraud marker is created on the receiver's CPF/CNPJ and key. Funds stay blocked."
          : "Rejected: funds are released immediately. Unjustified rejection makes the receiver PSP liable for the loss (Regulamento art. 41-I).",
      fr: verdict === "AGREED" ? "ANALYSED" : "COMPLETED (nothing to refund)",
      ir: `CLOSED (${verdict})`,
      bad: analysisDays > 7,
    });
    if (verdict === "AGREED") {
      if (refundDelayH > 72) {
        steps.push({ at: analysed + 72, who: "DICT", what: "72 h passed without RefundFundsRecovery", detail: "The DICT auto-completes the recovery; receivers unblock. The victim gets nothing.", fr: "COMPLETED", bad: true });
      } else {
        const refundAt = analysed + refundDelayH;
        recovered = blockedAmt;
        steps.push({ at: refundAt, who: "payer PSP", what: "POST /funds-recoveries/{id}/refund", detail: "Within 72 h after ANALYSED (event FUNDS_RECOVERY_ANALYSED via listEventNotifications). The DICT creates the refund requests.", fr: "REFUNDING", rf: "OPEN" });
        steps.push({
          at: refundAt + 2,
          who: "receiver PSP",
          what: "pacs.004 FR01, then closeRefund",
          detail: `Debits the blocked ${brl(blockedAmt)} and returns it (≤ 6 h in 99% of cases). Closes with RefundAnalysisResult=${blockedAmt >= AMOUNT - 0.5 ? "TOTALLY_ACCEPTED" : "PARTIALLY_ACCEPTED"}, RefundTransactionId and EffectiveRefundedAmount.`,
          fr: "COMPLETED",
          rf: "CLOSED",
        });
      }
    }
  }

  const tk = useTicker(() => setIdx((i) => Math.min(steps.length - 1, i + 1)), { speed: 0.012 });
  const cur = Math.min(idx, steps.length - 1);
  const now = steps[cur].at;
  const blockStep = steps.find((s) => s.ir?.includes("ACKNOWLEDGED"));
  const xMax = Math.max(3, Math.min(48, (blockStep?.at ?? 2) * 1.6));
  const pts: [number, number][] = Array.from({ length: 121 }, (_, i) => {
    const h = (i / 120) * xMax;
    if (mode === "cautelar") return [h, AMOUNT];
    if (blockStep && h >= blockStep.at) return [h, blockedAmt];
    return [h, left(h)];
  });

  const reset = () => {
    setIdx(0);
    tk.pause();
  };

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={tk.toggle}>
          {tk.running ? "Pause" : "Play"}
        </Button>
        <Button onClick={() => setIdx(Math.min(steps.length - 1, cur + 1))}>Step</Button>
        <Button onClick={reset}>Reset</Button>
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v);
            setIdx(0);
          }}
          options={[
            { value: "med", label: "victim reports (MED)" },
            { value: "cautelar", label: "receiver blocks first (cautelar)" },
          ]}
        />
        {mode === "med" && (
          <>
            <Slider label="victim reports after" value={rv} min={0} max={100} onChange={setRv} format={(v) => fmtH(delayOf(v))} className="min-w-60 flex-1" />
            <Slider label="PSP opens recovery in" value={openMin} min={1} max={60} onChange={setOpenMin} format={(v) => `${v} min`} className="min-w-56 flex-1" />
          </>
        )}
        <Slider label="mule moves half every" value={halfLife} min={5} max={600} step={5} onChange={setHalfLife} format={(v) => fmtH(v / 60)} className="min-w-56 flex-1" />
        <Slider label="analysis takes" value={analysisDays} min={0.1} max={9} step={0.1} onChange={setAnalysisDays} format={(v) => `${v.toFixed(1)} d`} className="min-w-52 flex-1" />
        {mode === "med" && <Slider label="refund requested after" value={refundDelayH} min={1} max={96} onChange={setRefundDelayH} format={(v) => `${v} h`} className="min-w-56 flex-1" />}
        <Segmented
          value={verdict}
          onChange={setVerdict}
          options={[
            { value: "AGREED", label: "receiver agrees" },
            { value: "DISAGREED", label: "receiver disagrees" },
          ]}
        />
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="The MED clock" right={<span className="font-mono text-xs text-muted">T+{fmtH(now)}</span>}>
          <ol className="relative space-y-0">
            {steps.map((s, i) => (
              <li
                key={i}
                onClick={() => setIdx(i)}
                className={clsx(
                  "grid cursor-pointer grid-cols-[72px_1fr] gap-3 border-l-2 py-2 pl-3 transition",
                  i === cur ? "border-accent bg-panel-2/60" : i < cur ? "border-faint opacity-80" : "border-line opacity-40",
                )}
              >
                <span className="font-mono text-xs text-muted">T+{fmtH(s.at)}</span>
                <span className="min-w-0">
                  <span className="text-[11px] tracking-wide text-faint uppercase">{s.who}</span>
                  <span className={clsx("block text-sm", s.bad ? "text-bad" : "text-ink")}>{s.what}</span>
                  {i <= cur && <span className="block text-xs leading-relaxed text-muted">{s.detail}</span>}
                  {i <= cur && (s.fr || s.ir || s.rf) && (
                    <span className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10.5px]">
                      {s.fr && <span className="rounded border border-line px-1.5 text-accent">FundsRecovery {s.fr}</span>}
                      {s.ir && <span className="rounded border border-line px-1.5 text-warn">InfractionReport {s.ir}</span>}
                      {s.rf && <span className="rounded border border-line px-1.5 text-ok">Refund {s.rf}</span>}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-faint">
            Try: drag &quot;victim reports after&quot; from 20 minutes to 6 hours with a 45-minute mule: the blocked amount collapses, because nothing in the
            procedure can be faster than the money leaving. Then switch to the cautelar mode: when the receiving PSP blocks on arrival, the full
            amount is safe. Push analysis past 7 days or the refund past 72 h to see the deadlines bite.
          </p>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="stolen" value={brl(AMOUNT)} />
            <Stat label="blocked" value={brl(blockedAmt)} tone={blockedAmt > AMOUNT * 0.8 ? "good" : blockedAmt > AMOUNT * 0.3 ? "warn" : "bad"} />
            <Stat label="returned" value={brl(recovered)} tone={recovered > 0 ? "good" : "bad"} />
            <Stat label="step" value={`${cur + 1}/${steps.length}`} />
          </div>
          <Panel title="Money left in the mule account" bodyClassName="p-3">
            <LineChart
              height={180}
              width={320}
              xDomain={[0, xMax]}
              yDomain={[0, AMOUNT * 1.05]}
              xLabel="hours"
              xFormat={(v) => String(v)}
              yFormat={(v) => `${v / 1000}k`}
              legend={false}
              series={[{ id: "m", label: "balance", color: "#f87171", points: pts, area: true }]}
              markers={blockStep && mode === "med" ? [{ x: blockStep.at, label: "block", color: "#fbbf24" }] : []}
            />
          </Panel>
          <Panel title="Deadlines" bodyClassName="p-3">
            <ul className="space-y-1 text-xs text-muted">
              <li><span className="font-mono text-ink">80 d</span> to contest a Pix (also a devolução, since 01/09/2026)</li>
              <li><span className="font-mono text-ink">30 min</span> complaint → recovery opened (p95)</li>
              <li><span className="font-mono text-ink">180 s</span> receiver acknowledges (p95), blocks at once</li>
              <li><span className="font-mono text-ink">7 d</span> receiver analyses and closes</li>
              <li><span className="font-mono text-ink">72 h</span> payer PSP starts the refund stage</li>
              <li><span className="font-mono text-ink">6 h</span> each receiver returns (p99), sequentially</li>
              <li><span className="font-mono text-ink">72 h</span> max for a bloqueio cautelar</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
