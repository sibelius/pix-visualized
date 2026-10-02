import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { architecture } from "@/content/architecture";
import { LifeOfAPix } from "@/components/architecture/LifeOfAPix";
import { ComponentMap } from "@/components/architecture/ComponentMap";
import { ParticipantMap } from "@/components/architecture/ParticipantMap";
import { RtgsVsDns } from "@/components/architecture/RtgsVsDns";
import { ArranjoStack } from "@/components/architecture/ArranjoStack";
import { GrowthChart } from "@/components/architecture/GrowthChart";

export const metadata = { title: "The architecture of Pix" };

export default function Page() {
  return (
    <>
      <PageHeader n="01" title="The architecture of Pix" color={CHAPTER_COLOR.architecture}>
        A Pix is two PSPs and the Banco Central do Brasil exchanging a handful of signed ISO 20022 messages. The payer&apos;s PSP finds the
        payee through the DICT, sends a pacs.008 to the SPI, the SPI blocks funds in the payer PSP&apos;s Conta PI and asks the payee&apos;s
        PSP, and when it says yes the SPI moves central bank money between the two accounts — gross, final, any second of any day. This
        chapter maps the pieces (SPI, DICT, ICOM, RSFN, STR, Conta PI), the kinds of participants, why gross settlement costs so much
        liquidity, and which rulebook governs what. Message versions follow the SPI catalog 5.13 (mandatory from 25 Oct 2026; 5.12 is in
        production until then).
      </PageHeader>

      <div id="life">
        <Section
          title="The life of one Pix"
          concepts={["spi-system", "arch-conta-pi", "settlement-finality", "arch-manual-de-tempos"]}
          intro="Every step of a Pix between two direct participants, timed with the Manual de Tempos timestamps t0′ to t6a. Step through it, watch the Conta PI balances, and push a hop past its budget."
        >
          <LifeOfAPix />
        </Section>
      </div>

      <div id="components">
        <Section
          title="The components and what flows between them"
          concepts={["arch-dict", "arch-icom", "arch-rsfn", "str-system"]}
          intro="Three BCB systems do the work — DICT finds the account, SPI settles, STR supplies liquidity — reached over the RSFN through two HTTPS interfaces. Click a box to see who runs it and what it speaks."
        >
          <ComponentMap />
        </Section>
      </div>

      <div id="participants">
        <Section
          title="Participants: direct, indirect, and what they may do"
          concepts={["direct-participant", "indirect-participant", "participation-modalities", "mandatory-participation", "ispb"]}
          intro="Two independent choices define a participant: its modality in the Pix (what it may offer) and its mode in the SPI (whether it holds a Conta PI). Toggle them and watch the accounts and the AppHdr change."
        >
          <ParticipantMap />
        </Section>
      </div>

      <div id="rtgs">
        <Section
          title="24/7 gross settlement vs netting"
          concepts={["rtgs", "deferred-net-settlement"]}
          intro="The same day of payments between N PSPs, settled two ways. Gross settlement needs each PSP to fund its worst moment; netting only needs the end-of-day difference — until someone defaults."
        >
          <div className="space-y-4">
            <RtgsVsDns />
            <Callout tone="info">
              Why pay for RTGS? Because a Pix must be final for the payee within seconds, at 3 a.m. on a Sunday, with no exposure between
              PSPs. The BCB softens the liquidity cost instead of the finality: Conta PI balances up to a cap earn Selic, PSPs pre-fund through
              the STR on business days, and an automatic transfer can sweep balances back to reserves at the STR close.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="arranjo">
        <Section
          title="The arranjo vs the infrastructure"
          concepts={["arranjo-pix", "regulamento-pix", "regulamento-spi"]}
          intro="Pix is a payment scheme whose owner, operator and supervisor are the same institution. Pick a question to see which document answers it."
        >
          <ArranjoStack />
        </Section>
      </div>

      <div id="growth">
        <Section
          title="How big it got"
          intro="Daily records, monthly volume and yearly totals, drawn by hand. Every point carries its source; numbers not confirmed in a BCB release are marked approximate."
        >
          <GrowthChart />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="a">
            A Pix is a short conversation: pacs.008 out, pacs.002 ACSP back, settlement at t4, then ACCC to the payee PSP and ACSC to the
            payer PSP. Before t4 everything is a hold; after t4 nothing can be undone except by a new pacs.004.
          </Fragment>,
          <Fragment key="b">
            The SPI is RTGS with no overdraft and no queue: each PSP must hold enough central bank money in its Conta PI for its worst burst
            of outflows, and top it up through the STR, which closes on weekends.
          </Fragment>,
          <Fragment key="c">
            Read the regulation as two layers: the arranjo (Res. BCB nº 1/2020 and its twelve manuals) binds every participant; the
            infrastructure rules (Res. BCB nº 195/2022) bind those that hold a Conta PI.
          </Fragment>,
        ]}
      />

      <ConceptList chapter={architecture} />
    </>
  );
}
