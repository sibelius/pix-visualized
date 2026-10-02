import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { spi } from "@/content/spi";
import { Pacs008Builder } from "@/components/spi/Pacs008Builder";
import { FlowClock } from "@/components/spi/FlowClock";
import { StatusExplorer } from "@/components/spi/StatusExplorer";
import { FailureLab } from "@/components/spi/FailureLab";
import { Idempotency } from "@/components/spi/Idempotency";
import { StateMachine } from "@/components/spi/StateMachine";

export const metadata = { title: "Payment: pacs.008 → pacs.002" };

export default function Page() {
  return (
    <>
      <PageHeader n="05" title="Payment: pacs.008 → pacs.002" color={CHAPTER_COLOR.spi}>
        When a Pix goes from one institution to another, the payer PSP signs a <code className="font-mono text-ink">pacs.008</code> and posts it to the SPI. The SPI
        checks it, reserves the amount in the payer PSP&apos;s <i>Conta PI</i>, and hands it to the receiver PSP, which checks the account and answers with a{" "}
        <code className="font-mono text-ink">pacs.002</code>. Then the SPI moves the money between the two Conta PI in one irrevocable step and tells both sides.
        All of it has to fit in 40 seconds, counted from the moment the payer tapped confirm. This chapter builds the messages field by field from the SPI catalog
        and runs the cycle against the clock of the Manual de Tempos (v7.0). Versions shown are catalog 5.13 (pacs.008.spi.1.16, pacs.002.spi.1.17), published in July
        2026 and mandatory for the settlement cycle from 25 October 2026 at 12:00; until then 5.12 (pacs.008.spi.1.15, pacs.002.spi.1.16) is the live version.
      </PageHeader>

      <div id="builder">
        <Section
          title="Build a pacs.008"
          concepts={["spi-pacs008", "spi-end-to-end-id", "spi-msgid", "spi-forma-iniciacao", "spi-finalidade", "spi-channels"]}
          intro="Change the inputs and the XML regenerates. The catalog's filling rules are evaluated live, and a broken rule marks the field and names the reason code you would get. Hover any line for its meaning."
        >
          <Pacs008Builder />
        </Section>
      </div>

      <div id="flow">
        <Section
          title="The settlement cycle, on a clock"
          concepts={["spi-prioridade", "spi-accptnc-dt-tm", "spi-timeout", "spi-validation-limit", "spi-provisional-credit"]}
          intro="The timestamps t0′ to t6a are the ones the Manual de Tempos uses for its SLAs. Set each party's latency, press Send, and see which limit is hit first."
        >
          <div className="space-y-4">
            <FlowClock />
            <Callout tone="info">
              Two different budgets. The <b>validation limit</b> (34 s, IN BCB 243 art. 18) is about the payer PSP: the gap it reports between AccptncDtTm and the
              moment it sends the order. The <b>settlement limit</b> (40 s on the primary channel, 45 min on the secondary) covers the whole cycle; for HIGH orders the
              SPI deducts the reported validation time, so in effect the clock started at t0′. For PAGFRD it starts when the SPI receives the order.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="status">
        <Section
          title="pacs.002: statuses and reason codes"
          concepts={["spi-pacs002", "spi-tx-sts", "spi-reason-codes"]}
          intro="All 45 reason codes the pacs.002.spi.1.17 XSD allows in StsRsnInf/Rsn/Cd, with the party the catalog says raises each one. DS02 and DU03 are new in 1.17 and are not valid under 5.12. Pick a code to see the pacs.002 that carries it."
        >
          <StatusExplorer />
        </Section>
      </div>

      <div id="failures">
        <Section
          title="Inject a failure"
          concepts={["spi-bloqueio", "spi-admi002", "spi-reason-codes"]}
          intro="Each failure stops the cycle at a different step. Where it stops decides who answers, which message comes back, whether liquidity was reserved and whether the receiver PSP ever knew."
        >
          <FailureLab />
        </Section>
      </div>

      <div id="idempotency">
        <Section
          title="Resend, don't ask: idempotency"
          concepts={["spi-idempotency", "spi-end-to-end-id"]}
          intro="The SPI keeps every operation's key, a fingerprint of its content and the answer it gave, for 24 hours. Here the fingerprint is a real SHA-256 of the operation's canonical fields, computed in your browser."
        >
          <Idempotency />
        </Section>
      </div>

      <div id="states">
        <Section
          title="States of a transaction, and how to ask about one"
          concepts={["spi-finality", "spi-status-query"]}
          intro="From the SPI's side a payment moves through a handful of states, and only one transition moves money. When a PSP has lost track, it can resend, or ask about the Conta PI entry."
        >
          <StateMachine />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="a">
            The SPI <b>reserves before it forwards</b> and <b>settles only after the receiver says ACSP</b>. Liquidity failures never reach the receiver; account failures
            always come from it.
          </Fragment>,
          <Fragment key="b">
            The 40 s budget is the payer&apos;s experience, so it starts at AccptncDtTm. A slow payer PSP (AB11) or a slow receiver PSP (AB03) both spend it, and only the
            SPI can call time.
          </Fragment>,
          <Fragment key="c">
            The EndToEndId is the payment. Resending an identical operation is safe and is the official way to recover from a lost answer; reusing the id for something
            else is an error.
          </Fragment>,
        ]}
      />
      <ConceptList chapter={spi} />
    </>
  );
}
