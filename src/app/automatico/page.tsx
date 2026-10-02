import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { automatico } from "@/content/automatico";
import { Journeys } from "@/components/automatico/Journeys";
import { RecBuilder } from "@/components/automatico/RecBuilder";
import { Lifecycle } from "@/components/automatico/Lifecycle";
import { BillingCalendar } from "@/components/automatico/BillingCalendar";
import { Settlement } from "@/components/automatico/Settlement";
import { ApiPlayground } from "@/components/automatico/ApiPlayground";
import { Compare } from "@/components/automatico/Compare";

export const metadata = { title: "Pix Automático" };

export default function Page() {
  return (
    <>
      <PageHeader n="12" title="Pix Automático" color={CHAPTER_COLOR.automatico}>
        Live since 16 June 2025, Pix Automático is Brazil&apos;s direct debit rebuilt on Pix. It has two halves. The payer grants an <em>autorização</em> once, through
        one of four journeys, carried by mandate messages (pain.009, pain.012, pain.011). After that the receiver sends one instruction per cycle (pain.013). The
        payer&apos;s PSP checks each instruction against the authorization, schedules it, answers with a pain.014, and settles it with a pacs.008 on the SPI secondary
        channel, between midnight and 8 a.m. on the due date. Retries, cancellations and value caps all run on fixed deadlines, set by the Regulamento (Res. BCB
        402/2024), IN BCB 513/2024, the Guia de Implementação v1.3 and the Manual de Tempos.
      </PageHeader>

      <div id="journeys">
        <Section
          title="Four ways to say yes: the authorization journeys"
          concepts={["jornadas-autorizacao", "autorizacao-automatico", "qr-code-composto", "pain-009-012"]}
          intro="The same end state (rec.status APROVADA) is reached through four different message choreographies. Step through each one and watch which actor speaks, over which channel, and which timer is running."
        >
          <Journeys />
        </Section>
      </div>

      <div id="recorrencia">
        <Section
          title="The recorrência object: idRec, cycles and value rules"
          concepts={["recorrencia", "idrec", "ciclo-cobranca", "valor-maximo"]}
          intro="Everything a charge will later be checked against is fixed here. Build one: the idRec is assembled from its formation rule, cycles are derived from the first date, and the value fields obey their mutual-exclusion rules."
        >
          <RecBuilder />
        </Section>
      </div>

      <div id="lifecycle">
        <Section
          title="A state machine you drive"
          concepts={["rec-status", "pain-009-012", "camt-055-automatico"]}
          intro="Fire events as receiver, payer, PSP or the clock. Only legal transitions are enabled. Each one logs the message it would put on the wire and its side-effects."
        >
          <div className="space-y-4">
            <Lifecycle />
            <Callout tone="info">
              Unilateral by design: either end can cancel at any time and the other must accept. When the payer cancels, everything already scheduled is cancelled
              except debits settling that same day. When the receiver cancels, schedules from D+1 are cancelled, or from D+2 if the pain.011 arrives after 22h.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="calendar">
        <Section
          title="The billing calendar: six cycles of instructions, windows and retries"
          concepts={["pain-013-014", "janela-liquidacao", "politica-retentativa", "valor-maximo", "ajuste-dia-util", "camt-055-automatico"]}
          intro="A monthly variable bill starting on a holiday. For each cycle the engine applies every rule. The pain.013 must arrive 2–10 days ahead. The payer PSP validates it and answers within 2 h. Settlement runs 0h–8h, with a forced retry at 18h–21h, then up to three NTAG dates within 7 days if the recorrência allows them. Click a row and change when the payer's money arrives."
        >
          <BillingCalendar />
        </Section>
      </div>

      <div id="settlement">
        <Section
          title="From pain.013 to pacs.008: what the settlement message carries"
          concepts={["e2e-automatico", "rifl", "pain-013-014"]}
          intro="The payer PSP builds the pacs.008 from the instruction it scheduled. Hover a field to see where it comes from. The EndToEndId is the unusual part: the receiver side generates it, ahead of time, dated for settlement."
        >
          <Settlement />
        </Section>
      </div>

      <div id="api">
        <Section
          title="The receiver's side: API Pix endpoints"
          concepts={["recorrencia", "politica-retentativa"]}
          intro={
            <>
              Receivers drive Pix Automático through the API Pix tags Rec, SolicRec, CobR, PayloadLocationRec, WebhookRec and WebhookCobR (or through the{" "}
              <em>arquivo padronizado</em>). This toy PSP validates requests with the violations the spec lists, against a server state you control. See the API Pix
              chapter (<a className="text-accent hover:underline" href="/api-pix">/api-pix</a>) for OAuth2, mTLS and webhooks in general.
            </>
          }
        >
          <ApiPlayground />
        </Section>
      </div>

      <div id="compare">
        <Section
          title="Compared with débito automático, boleto and card-on-file"
          concepts={["pix-automatico", "ressarcimento-automatico"]}
          intro="What changes for a receiver and for a payer in common situations. The difference is less about speed than about who writes the rules."
        >
          <Compare />
        </Section>
      </div>

      <Takeaways
        items={[
          <>
            <strong className="text-ink">Authorize once, instruct every cycle.</strong> The pain.009/012 handshake creates shared state in two PSPs. Each pain.013 is then
            checked against it: periodicity, amount, receiver, and a lead time of 2–10 days.
          </>,
          <>
            <strong className="text-ink">The payer PSP is the gatekeeper.</strong> It alone knows the valor máximo, checks it when the debit is scheduled, settles between
            0h and 8h, and must retry at 18h–21h. If it debits wrongly it refunds the payer from its own money within 24 h.
          </>,
          <>
            <strong className="text-ink">Every retry is a new instruction.</strong> NTAG (≤ 3 dates in 7 days, only for RR… ids) and RIFL (same day, after a settlement
            failure) each carry a fresh, receiver-generated EndToEndId, because the SPI never settles the same E2E twice.
          </>,
        ]}
      />

      <ConceptList chapter={automatico} />
    </>
  );
}
