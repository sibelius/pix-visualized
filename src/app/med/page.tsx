import { Fragment } from "react";
import Link from "next/link";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { med } from "@/content/med";
import { MedClock } from "@/components/med/MedClock";
import { TracingGraph } from "@/components/med/TracingGraph";
import { Lifecycles } from "@/components/med/Lifecycles";
import { SelfService } from "@/components/med/SelfService";
import { RiskDecision } from "@/components/med/RiskDecision";

export const metadata = { title: "MED & anti-fraud" };

export default function Page() {
  return (
    <>
      <PageHeader n="13" title="MED & anti-fraud" color={CHAPTER_COLOR.med}>
        A Pix settles in seconds and cannot be undone, which is exactly what makes it attractive to scammers. The answer is the{" "}
        <em>Mecanismo Especial de Devolução</em>: block the money where it landed, let the receiving PSP judge, and return what is left with a{" "}
        <code className="font-mono text-sm">pacs.004</code>. Since February 2026 the MED runs as <em>Recuperação de Valores</em> (MED 2.0) in the DICT
        API: the DICT follows the money through mule accounts, blocks several hops at once and walks the refunds back to the victim. On the other
        side, fraud markers and DICT statistics feed the payer PSP&apos;s decision before the next Pix leaves. Sources: Regulamento Pix (with Res. BCB
        402, 493, 559 and 587), Manual Operacional do DICT v8.5, Guia de implementação do MED v4.3, Manual de Tempos do Pix v7.0, API DICT v2.12.1.
      </PageHeader>

      <div id="clock" className="scroll-mt-20">
        <Section
          title="The MED clock"
          concepts={["med-mechanism", "med-deadlines", "bloqueio-cautelar"]}
          intro="One stolen Pix, step by step, with every deadline the rules impose. The amount you get back is the balance left in the mule account at the moment of the block, so set how fast the victim reports and how fast the mule moves the money, and compare with a receiver that blocks on arrival."
        >
          <MedClock />
        </Section>
      </div>

      <div id="tracing" className="scroll-mt-20">
        <Section
          title="MED 2.0: following the money across hops"
          concepts={["root-transaction", "tracking-graph", "tracking-parameters", "med-block", "med-analysis", "iprt-layered-refund"]}
          intro="R$ 10,000 leaves the victim and is split across mule accounts within minutes. The DICT builds a tracking graph from the root with the TrackingGraphParameters, opens an infraction report per selected transaction, every receiving PSP blocks what is still there, and refunds are walked back in breadth-first order. The algorithm here follows the Manual's rules; the BCB's real prioritization is internal."
        >
          <TracingGraph />
          <div className="mt-4">
            <Callout tone="info">
              The interactive endpoints (<code className="font-mono text-sm">POST …/tracking-graph</code>, <code className="font-mono text-sm">…/block</code>{" "}
              with a <code className="font-mono text-sm">TRANSACTION_LIST</code> prioritization) were deprecated in API 2.9.0: the DICT now tracks,
              prioritizes and blocks automatically. The parameter caps in the published spec contradict its own example, so the sliders above are
              there to show the mechanism, not the production limits.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="lifecycle" className="scroll-mt-20">
        <Section
          title="Recovery, report, refund, marker: the state machines"
          concepts={["funds-recovery", "infraction-report", "med-refund-request", "event-notifications"]}
          intro="Four DICT objects move together. Drive them as the payer PSP and the receiving PSP and read the real request bodies (hover any field). The DICT pushes nothing: each side polls lists and event notifications."
        >
          <Lifecycles />
        </Section>
      </div>

      <div id="selfservice" className="scroll-mt-20">
        <Section
          title="Autoatendimento: the contest button in the app"
          concepts={["med-self-service", "situation-type", "med-exclusions", "contested-refund"]}
          intro="Every app for individuals must let the user contest a Pix straight from the statement. The triage has to keep non-MED cases out, and an eligible answer becomes a CreateFundsRecoveryRequest immediately, without merit analysis."
        >
          <SelfService />
        </Section>
      </div>

      <div id="risk" className="scroll-mt-20">
        <Section
          title="Before the next Pix: fraud markers and the risk decision"
          concepts={["fraud-marker", "payer-risk-engine"]}
          intro="Every AGREED report becomes a fraud marker, and markers come back to every payer PSP as DICT statistics. Combine them with the entry data and the regulatory limits into a decision. The hard rules are real; the score is a transparent illustration."
        >
          <RiskDecision />
          <div className="mt-4">
            <Callout>
              Limits are covered in depth in{" "}
              <Link href="/beyond#limits" className="text-accent underline-offset-2 hover:underline">
                Beyond the basic Pix
              </Link>
              : night period 20h–6h with R$ 1,000 for PF → PF by default (IN BCB 512/2024), limit increases effective only 24–48 h after the request,
              and R$ 200 per transaction / R$ 1,000 per day on devices not registered by the user (IN BCB 491/2024).
            </Callout>
          </div>
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t0">Recovery is bounded by the balance at block time. Open the funds recovery within minutes of the complaint; analysis can come later, money cannot.</Fragment>,
          <Fragment key="t1">MED 2.0 traces and blocks several hops at once, but a single DISAGREED cuts off everything downstream, and good-faith third parties keep what they received.</Fragment>,
          <Fragment key="t2">Every confirmed case becomes a 5-year fraud marker that returns to all PSPs through DICT statistics: the cheapest recovery is the payment you refuse.</Fragment>,
        ]}
      />

      <ConceptList chapter={med} />
    </>
  );
}
