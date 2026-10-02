import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { icom } from "@/content/icom";
import { RequestLinter } from "@/components/icom/RequestLinter";
import { TlsLifecycle } from "@/components/icom/TlsLifecycle";
import { Channels } from "@/components/icom/Channels";
import { TokenBucket } from "@/components/icom/TokenBucket";
import { PullStreams } from "@/components/icom/PullStreams";
import { MultipartGzip } from "@/components/icom/MultipartGzip";
import { Delivery } from "@/components/icom/Delivery";
import { EchoAdmi } from "@/components/icom/EchoAdmi";

export const metadata = { title: "ICOM: talking to the SPI" };

export default function Page() {
  return (
    <>
      <PageHeader n="08" title="ICOM: talking to the SPI" color={CHAPTER_COLOR.icom}>
        Every pacs.008, pacs.002, camt and admi message between a PSP and the SPI travels through the ICOM. It is a deliberately plain HTTP API: HTTP/1.1 over
        mutually authenticated TLS on the RSFN, XML bodies, five endpoints. You POST to send, and the API only stores what you sent. Everything addressed to you
        waits in a queue until you long-poll it with GET, following an opaque PI-Pull-Next cursor, and you finish each read with DELETE. The hard parts are
        operational: keeping connections warm, batching and compressing, staying inside a token bucket and the six-reader limit, and deduplicating a stream that
        delivers at least once. Source: Manual das Interfaces de Comunicação v1.12 (Dec 2025), plus the Catálogo do SPI 5.13 and the Security manual v6.00. Numbers the
        BCB does not publish are labeled as such.
      </PageHeader>

      <div id="anatomy">
        <Section
          title="Anatomy of a request: five endpoints and a strict header list"
          concepts={["icom-interface", "icom-post-msgs", "icom-gzip"]}
          intro="Edit a raw HTTP request and a linter applies the manual's rules as you type: HTTP/1.1 only, Host without port, the allowed header list, Content-Type with charset=utf-8, a length header for any body, gzip as the only encoding (mandatory on the secondary channel), at most 10 parts, and an {ispb} that matches your certificate."
        >
          <RequestLinter />
        </Section>
      </div>

      <div id="tls" className="mt-12">
        <Section
          title="Before HTTP: allowlist, mutual TLS, and what each status code means"
          concepts={["icom-mtls", "icom-ip-allowlist", "icom-persistent-connections", "icom-problem-details"]}
          intro="Step through a full connection from TCP to the 201, then inject the failures that actually happen in production. The table below answers the question every retry policy needs answered: was the message stored?"
        >
          <TlsLifecycle />
        </Section>
      </div>

      <div id="channels" className="mt-12">
        <Section
          title="Two channels: primary (CPM) and secondary (CSM)"
          concepts={["icom-channels"]}
          intro="Since October 2023 the ICOM has two separate hosts. One is for payments the payer expects to settle in seconds. The other is for traffic with no such expectation, like scheduled Pix, Pix Automático instructions and bulk reports. Pick a message to see where it goes and what changes."
        >
          <Channels />
        </Section>
      </div>

      <div id="token-bucket" className="mt-12">
        <Section
          title="Rate limiting: the token bucket behind 429"
          concepts={["icom-token-bucket"]}
          intro="Each PSP has a bucket that refills every second up to a cap, and is debited as its messages are processed, not when they are received. That is why the balance can go negative. While the previous second ended at or below zero, every new request gets 429 with Retry-After. The parameters are the manual's; the BCB may change them per participant."
        >
          <TokenBucket />
        </Section>
      </div>

      <div id="streams" className="mt-12">
        <Section
          title="Receiving: N long-poll streams racing a queue"
          concepts={["icom-long-polling", "icom-concurrent-streams"]}
          intro="A live simulation of your reader threads against the SPI's out-queue for your ISPB. Each thread GETs, the ICOM holds the request until a message exists (or answers 204), the response travels back, your thread does its work, then GETs again. Messages left unread too long expire, and the SPI rejects the payment with AB03. The long-poll hold time is not published (“alguns segundos”), so it is a slider here."
        >
          <PullStreams />
          <div className="mt-4">
            <Callout tone="info">
              The BCB&apos;s homologation capacity test requires consuming at least 99% of the pacs.008/pacs.002 made available within 200 ms, while answering 50% of
              orders within 1.4 s and 95% within 2.3 s. The manual&apos;s advice for getting there: decouple reading from processing, use up to 6 threads per channel,
              always DELETE, and turn on gzip and multipart.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="multipart" className="mt-12">
        <Section
          title="Batching: multipart/mixed and gzip, measured"
          concepts={["icom-multipart", "icom-gzip", "pi-resourceid"]}
          intro="Build a real multipart/mixed body from up to 10 signed pacs.008 envelopes, then compress it with the browser's CompressionStream('gzip') and compare the sizes. POST it to get one PI-ResourceId per part."
        >
          <MultipartGzip />
        </Section>
      </div>

      <div id="delivery" className="mt-12">
        <Section
          title="At-least-once: cursors, crashes, DELETE and idempotency"
          concepts={["pi-pull-next", "icom-stream-delete", "icom-at-least-once", "icom-idempotency"]}
          intro="A model of the ICOM's read semantics. Following the latest PI-Pull-Next acknowledges the previous batch, and DELETE acknowledges the last one. Anything not acknowledged is delivered again with the same ResourceId. On the sending side, resending is safe because the SPI is idempotent per operation."
        >
          <Delivery />
        </Section>
      </div>

      <div id="echo-errors" className="mt-12">
        <Section
          title="Echo, rejections and notices: pibr, admi.002, admi.004"
          concepts={["pibr-echo", "admi002-reject", "admi004-notice"]}
          intro="Three message types that are not payments but that every integration has to handle: the echo pair that tests the whole chain end to end, the message-level reject that tells you a 201'd message died, and the operational notice that arrives mixed in with your payments."
        >
          <EchoAdmi />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="a">
            A 201 from the ICOM means stored, not valid and not settled. Validation errors come back as admi.002 and results as pacs.002, both on your read stream. Design
            the sender as fire-and-correlate: keep the PI-ResourceId and match the answers by MsgId and EndToEndId.
          </Fragment>,
          <Fragment key="b">
            Read throughput ≈ min(6, threads) × batch / (RTT + work per loop). Keep business logic out of the loop, turn on multipart and gzip, never exceed 6 threads,
            and always DELETE.
          </Fragment>,
          <Fragment key="c">
            The stream delivers at least once and the SPI deduplicates per operation. Your system must do both: dedupe deliveries on ResourceId and operations on
            EndToEndId/RtrId, persist before you follow PI-Pull-Next, and resend after a 5xx without fear.
          </Fragment>,
        ]}
      />
      <ConceptList chapter={icom} />
    </>
  );
}
