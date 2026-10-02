import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { returns } from "@/content/returns";
import { Pacs004Builder } from "@/components/returns/Pacs004Builder";
import { PartialLedger } from "@/components/returns/PartialLedger";
import { ReturnFlow } from "@/components/returns/ReturnFlow";
import { ApiDevolucao } from "@/components/returns/ApiDevolucao";
import { ReturnVsNewPix } from "@/components/returns/ReturnVsNewPix";
import { Conservation } from "@/components/returns/Conservation";

export const metadata = { title: "Returns: pacs.004" };

export default function Page() {
  return (
    <>
      <PageHeader n="06" title="Returns: pacs.004" color={CHAPTER_COLOR.returns}>
        Once the SPI has moved the balances, a Pix is final. If the money has to go back, the user who received it starts a <i>devolução</i> (return): their PSP sends a{" "}
        <code className="font-mono text-ink">pacs.004</code> that points at the original payment by its EndToEndId, and the SPI runs the same reserve, confirm and settle
        cycle in the opposite direction. A payment can be returned in several parts, never more than its amount, and normally within 90 days. Four reason codes cover
        everything: MD06 for ordinary refunds, BE08 and FR01 for MED, SL02 for Pix Saque and Troco. Message versions are from catalog 5.13 (pacs.004.spi.1.5, the same
        version as in 5.12).
      </PageHeader>

      <div id="anatomy">
        <Section
          title="Anatomy of a pacs.004"
          concepts={["ret-pacs004", "ret-rtr-id", "ret-orgnl-e2e", "ret-swapped-roles", "ret-sttlm-prty"]}
          intro="The whole message, generated from your inputs. Compare it with the pacs.008 of the previous chapter: no payer, no receiver, no accounts, just the link to the original and the two agents with their roles swapped."
        >
          <Pacs004Builder />
        </Section>
      </div>

      <div id="ledger">
        <Section
          title="Partial returns: the returnable balance"
          concepts={["ret-partial", "ret-90-days", "ret-am09", "ret-sl02"]}
          intro="One R$ 100 payment, many returns. Each attempt is checked against what has already been returned and against the calendar."
        >
          <PartialLedger />
        </Section>
      </div>

      <div id="flow">
        <Section
          title="The return flow"
          concepts={["ret-devolucao", "ret-dt05"]}
          intro="The 23 steps of the Manual de Fluxos §4.1, grouped. In the manual's vocabulary the original receiver is the remetente and the original payer the destinatário."
        >
          <ReturnFlow />
        </Section>
      </div>

      <div id="api">
        <Section
          title="From the API Pix to a pacs.004"
          concepts={["ret-natureza", "ret-md06", "ret-api-status"]}
          intro="Companies usually return through their PSP's API Pix rather than an app. Each PUT becomes one pacs.004, and the status follows the pacs.002."
        >
          <div className="space-y-4">
            <ApiDevolucao />
            <Callout tone="info">
              The API checks some rules before anything reaches the SPI (total above the original, reused <code className="font-mono">{"{id}"}</code>, past 90 days) and
              answers 400 <code className="font-mono">PixDevolucaoInvalida</code>. Others only show up later as a pacs.002 RJCT from the original payer&apos;s PSP, and the
              devolução ends <code className="font-mono">NAO_REALIZADO</code> with a <code className="font-mono">motivo</code>.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="why">
        <Section
          title="Why a return, and not just a new Pix?"
          concepts={["ret-be08-fr01", "ret-ag13", "ret-iprt-refu"]}
          intro="Sending a fresh pacs.008 back also moves money, but loses the link to the payment it compensates. The cases below show when the scheme insists on pacs.004 and when, in MED, it switches to a linked pacs.008."
        >
          <ReturnVsNewPix />
        </Section>
      </div>

      <div id="conservation">
        <Section
          title="Money conservation across Conta PI"
          concepts={["ret-conservation"]}
          intro="A R$ 100 payment, two partial returns and one rejected return, step by step, on the Conta PI of both PSPs at the Banco Central and on the two customer accounts."
        >
          <Conservation />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="a">
            A pacs.004 is a new operation with its own id (RtrId, D…) that names the original by EndToEndId. The original payer&apos;s PSP finds everything else from that
            link.
          </Fragment>,
          <Fragment key="b">
            The original amount is a budget shared by all partial returns (AM09 when exceeded), and the clock is 90 days (DT05), except for the cash part of Saque and
            Troco.
          </Fragment>,
          <Fragment key="c">
            Use a return to give money back, never a fresh Pix: only the return keeps the payment and its refund tied together for the payer, both PSPs and MED.
          </Fragment>,
        ]}
      />
      <ConceptList chapter={returns} />
    </>
  );
}
