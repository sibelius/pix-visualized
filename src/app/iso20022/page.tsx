import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { iso } from "@/content/iso";
import { EnvelopeExplorer } from "@/components/iso/EnvelopeExplorer";
import { IdBuilder, IdempotencyDemo } from "@/components/iso/IdBuilder";
import { NameDecoder } from "@/components/iso/NameDecoder";
import { Catalog } from "@/components/iso/Catalog";
import { TypeValidator } from "@/components/iso/TypeValidator";
import { LegacyCompare } from "@/components/iso/LegacyCompare";

export const metadata = { title: "ISO 20022 anatomy" };

export default function Page() {
  return (
    <>
      <PageHeader n="04" title="ISO 20022 anatomy" color={CHAPTER_COLOR.iso}>
        Every message to or from the SPI has the same shape: an <code>&lt;Envelope&gt;</code> in a BCB namespace holding a signed Business
        Application Header and an ISO 20022 Document, restricted by XSDs the BCB publishes in the Catálogo de Serviços do SFN, Volume VI. This
        chapter takes that envelope apart: the header and its signature, the two identifiers that matter (MsgId for the envelope, EndToEndId
        for the payment), the naming and versioning scheme, the full catalog of 27 messages, and the data types that reject bad input before
        any business rule runs. Versions shown are catalog 5.13 (24 Jul 2026), mandatory from 25 Oct 2026; production runs 5.12 until then
        (pacs.008.spi.1.15, pacs.002.spi.1.16).
      </PageHeader>

      <div id="envelope">
        <Section
          title="Inside the envelope"
          concepts={["spi-envelope", "business-application-header", "iso-multiplicity", "iso-20022"]}
          intro="A complete pacs.008 as a payer PSP sends it, and the pacs.002 the payee PSP answers with. Hover any element for its ISO name, the catalog's Portuguese name, multiplicity, type and meaning."
        >
          <EnvelopeExplorer />
        </Section>
      </div>

      <div id="ids">
        <Section
          title="MsgId and EndToEndId, character by character"
          concepts={["msg-id", "end-to-end-id", "rtr-id"]}
          intro="Both are 32 characters and look alike, but they answer different questions: which envelope is this, and which payment is this. Edit them; every segment is validated live against the XSD pattern and against the SPI's ±12 h rule."
        >
          <IdBuilder />
        </Section>
      </div>

      <div id="idempotency">
        <Section
          title="Why the EndToEndId is the idempotency key"
          concepts={["spi-idempotency"]}
          intro="A PSP that did not get an answer resends. The SPI stores each operation's key with its reply: same key and same content replays the reply, same key and different content is an error."
        >
          <div className="space-y-4">
            <IdempotencyDemo />
            <Callout tone="accent">
              The catalog makes idempotency a duty on both sides: the SPI and every PSP must store received transactions, their keys and the
              answers sent. That is what lets a PSP in doubt simply resend instead of asking &quot;did it go through?&quot;.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="naming">
        <Section
          title="Reading a message name"
          concepts={["iso-message-identifier", "msg-def-idr"]}
          intro="ISO names messages area.number.variant.version; the BCB names its restrictions area.number.spi.major.minor and puts the version into the envelope namespace. Paste any of the forms."
        >
          <NameDecoder />
        </Section>
      </div>

      <div id="catalog">
        <Section
          title="The SPI message catalog"
          concepts={["spi-catalog", "iso-business-area", "iso-channel-rule", "admi-002"]}
          intro="All 27 messages of catalog 5.13: who sends them, which channel they use, their idempotency key, and the Document skeleton read from the XSD. Click one; the link goes to the chapter that covers it."
        >
          <Catalog />
        </Section>
      </div>

      <div id="types">
        <Section
          title="XSD types: what gets rejected before business logic"
          concepts={["spi-xsd-restriction", "active-currency-and-amount", "iso-normalised-datetime", "sfn-charset"]}
          intro="The SPI XSDs narrow ISO's types with patterns, lengths, digits and enumerations. Type a value and see which facet it fails."
        >
          <TypeValidator />
        </Section>
      </div>

      <div id="legacy">
        <Section
          title="Before ISO 20022: the SPB's proprietary messages"
          concepts={["str0008"]}
          intro="TED still runs on the STR's own XML format. Put a TED (STR0008) next to a Pix (pacs.008) and the same ideas appear in different clothes."
        >
          <LegacyCompare />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="a">
            Envelope = AppHdr (who, to whom, which definition, when, signature) + Document (the ISO message). The namespace
            https://www.bcb.gov.br/pi/pacs.008/1.16 and MsgDefIdr pacs.008.spi.1.16 must agree with the XSD you validate against.
          </Fragment>,
          <Fragment key="b">
            MsgId names an envelope and changes every hop; EndToEndId names the payment and never changes. Deduplicate, trace and reconcile
            on the EndToEndId (and on RtrId for returns), with UTC timestamps.
          </Fragment>,
          <Fragment key="c">
            Validation is layered: XSD and signature first (admi.002), business rules later (pacs.002 RJCT + reason). Know the SPI
            restrictions — dot decimals, exactly-millisecond UTC, Latin-1 text — and most rejections never happen.
          </Fragment>,
        ]}
      />

      <ConceptList chapter={iso} />
    </>
  );
}
