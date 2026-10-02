import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { api } from "@/content/api";
import { ApiConsole } from "@/components/api/ApiConsole";
import { Lifecycle } from "@/components/api/Lifecycle";
import { Txid } from "@/components/api/Txid";
import { Security } from "@/components/api/Security";
import { Webhooks } from "@/components/api/Webhooks";
import { Reconciliation } from "@/components/api/Reconciliation";
import { Versions } from "@/components/api/Versions";

export const metadata = { title: "The API Pix" };

export default function Page() {
  return (
    <>
      <PageHeader n="11" title="The API Pix" color={CHAPTER_COLOR.api}>
        Everything a merchant&apos;s software does with Pix goes through one contract the BCB publishes as an OpenAPI file (github.com/bacen/pix-api, v2.10.0
        as of August 2026) and every PSP implements: create charges (<em>cobranças</em>) under your own <span className="font-mono">txid</span>, let the PSP host
        them behind dynamic-QR locations, then find out what was paid via webhooks and <span className="font-mono">GET /pix</span>, and refund with{" "}
        <em>devoluções</em>. Calls run over mutual TLS with certificate-bound OAuth tokens. This chapter runs a mock PSP in your browser with the spec&apos;s
        field names, status codes and error types, so you can push on the contract and see where integrations break.
      </PageHeader>

      <div id="console">
        <Section
          title="A console against a mock PSP"
          concepts={["api-pix", "api-cob", "api-revisao", "api-location", "api-problem-json", "api-lotecobv"]}
          intro="Choose an endpoint, edit the JSON, send. The mock keeps its state, checks the spec's violation lists and answers with real problem+json bodies. Paying a charge creates a Pix with a 32-character endToEndId and moves the cob to CONCLUIDA. Register a webhook first to see the callback the PSP would send."
        >
          <ApiConsole />
          <div className="mt-4">
            <Callout tone="info">
              The API Pix never returns a QR image. It returns <span className="font-mono">location</span> and <span className="font-mono">pixCopiaECola</span> (the
              BR Code string), and your software draws the QR from that. <span className="font-mono">GET /loc/{"{id}"}/qrcode</span>, which you will see in many PSP
              docs, is a vendor extension and not part of the BCB spec.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="lifecycle">
        <Section
          title="Lifecycles: what status means"
          concepts={["api-cob-status", "api-cobv", "api-devolucao", "api-devolucao-natureza"]}
          intro="Every entity has a small state machine, and the most common mistake is reading too much into it. A cob's status describes the record: expiry is never stored there. A refund is accepted asynchronously, and its final status arrives later."
        >
          <Lifecycle />
        </Section>
      </div>

      <div id="txid">
        <Section
          title="txid: the key you own"
          concepts={["api-txid", "api-idempotency"]}
          intro="The txid connects your order to the pacs.008 the SPI delivers to your PSP. Its format depends on where it appears, and who generates it decides whether a retry is safe."
        >
          <Txid />
        </Section>
      </div>

      <div id="security">
        <Section
          title="Security: mTLS + certificate-bound OAuth"
          concepts={["api-oauth-mtls", "api-cert-bound-token", "api-scopes"]}
          intro="Your client authenticates twice, once with its TLS certificate and once with client_id and secret, and the token it gets back only works over a connection that uses the same certificate. Step through the exchange and inject faults. The thumbprints are real SHA-256 digests, computed in your browser."
        >
          <Security />
        </Section>
      </div>

      <div id="webhooks">
        <Section
          title="Webhooks: delivery, retries, dedup"
          concepts={["api-webhook"]}
          intro="Instead of polling, you register a URL per Pix key. The PSP posts every credited Pix that has a txid. The spec fixes the target path and the channel, but leaves the retry policy to each PSP. The policy simulated here is illustrative: exponential backoff and a cap on attempts."
        >
          <Webhooks />
        </Section>
      </div>

      <div id="reconciliation">
        <Section
          title="Reconciliation"
          concepts={["api-reconciliation"]}
          intro="Money arrives whether or not your systems notice. Match each received Pix to a charge by txid and explain the amount, then decide what to do with the rest. Some Pix will never reach you through a webhook."
        >
          <Reconciliation />
        </Section>
      </div>

      <div id="versions">
        <Section
          title="How the API grew: 2.0 → 2.10"
          concepts={["api-versioning", "api-rec-cobr"]}
          intro="Charges with due dates, batches, standard errors, Saque/Troco, copy-and-paste strings, then a whole second API for Pix Automático, all inside v2. Pick a release, then see which resource groups a PSP must offer for each product."
        >
          <Versions />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t0">Generate the txid yourself (26–35 alphanumerics) and create charges with PUT: it is your idempotency key and your reconciliation key, and it is unique forever.</Fragment>,
          <Fragment key="t1">A charge&apos;s status is the status of the record. Expired is computed, CONCLUIDA is final, and refunds settle asynchronously (EM_PROCESSAMENTO → DEVOLVIDO | NAO_REALIZADO).</Fragment>,
          <Fragment key="t2">Webhooks go to {"{webhookUrl}"}/pix, only for Pix with a txid, with retries defined by each PSP. Deduplicate on the receiving side and still sweep GET /pix.</Fragment>,
        ]}
      />

      <ConceptList chapter={api} />
    </>
  );
}
