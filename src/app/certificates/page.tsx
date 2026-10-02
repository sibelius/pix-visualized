import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { certs } from "@/content/certs";
import { Topology } from "@/components/certs/Topology";
import { ChainValidator } from "@/components/certs/ChainValidator";
import { MtlsHandshake } from "@/components/certs/MtlsHandshake";
import { Rotation } from "@/components/certs/Rotation";
import { KeyDuties } from "@/components/certs/KeyDuties";
import { ApiPixSide } from "@/components/certs/ApiPixSide";

export const metadata = { title: "RSFN & certificates" };

export default function Page() {
  return (
    <>
      <PageHeader n="10" title="RSFN & certificates" color={CHAPTER_COLOR.certs}>
        Before a pacs.008 can be signed, a participant needs a path to the BCB and an identity it can prove. The path is the RSFN, a private
        network reached through authorized carriers or a PSTI, from IP addresses registered in advance. The identity is a set of ICP-Brasil
        certificates, one per job: <em>CERTPIC</em> for the mTLS connection, <em>CERTPIA</em> for message signatures, and on the internet
        side <em>CERTQRC</em> plus a JWS key for dynamic QR codes. Security Manual v6.00 (June 2026) made the connection and signature
        certificates strictly separate. This chapter follows those certificates through the network, chain validation, the handshake,
        rotation and key custody.
      </PageHeader>

      <div id="topology">
        <Section
          title="The RSFN and who presents which certificate"
          concepts={["rsfn-topology", "rsfn-carriers", "cert-bc-v10"]}
          intro="Everything above the line is a private network; everything below is the internet. Pick a certificate to see the links it protects, or fail a carrier or a data center."
        >
          <Topology />
        </Section>
      </div>

      <div id="chain">
        <Section
          title="Certificate chains and what gets validated"
          concepts={["cert-icp-brasil", "cert-spb-standard", "cert-certpic", "cert-certpia", "cert-certqrc", "cert-revocation-offline"]}
          intro="Four certificates, four validators. Inspect each chain (click a certificate to expand its fields), then break it to see which check fails first. The order follows RFC 5280 path validation followed by the Pix-specific rules."
        >
          <ChainValidator />
        </Section>
      </div>

      <div id="mtls">
        <Section
          title="The mTLS handshake to icom.pi.rsfn.net.br"
          concepts={["cert-mtls", "cert-certificate-verify", "cert-ip-allowlist"]}
          intro={
            <>
              A TLS 1.2 full handshake with the required suite <code>ECDHE-RSA-AES128-GCM-SHA256</code> (0xC02F). The ECDH key agreement
              and the CertificateVerify signature are computed for real in your browser. (TLS 1.3, allowed as &quot;1.2 or higher&quot; by
              the Security Manual, merges and encrypts several of these messages, but the same two certificates are checked.)
            </>
          }
        >
          <MtlsHandshake />
        </Section>
      </div>

      <div id="rotation">
        <Section
          title="Rotation without an outage"
          concepts={["cert-sta-activation", "cert-multi-active", "cert-auto-deactivation"]}
          intro="Registering a certificate is asynchronous (up to 7 days), and expiry comes one day early (deactivation 24 h before notAfter). Pix allows several active certificates, so the safe pattern is: upload early, wait for activation, switch, let the old one lapse. Move the three dates and play the timeline."
        >
          <div className="space-y-4">
            <Rotation />
            <Callout tone="info">
              The BCB rotates too, and participants have to follow. In the 2026 rotation the BCB activated its new production certificates,
              P514 (channel) and P515 (signature), with a mixed period on 22–23 February during which old and new certificates were both in use.
              A PSP that had not loaded P515 into its base of BCB certificates would have started rejecting genuine messages from the
              BCB.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="duties">
        <Section
          title="Separation of duties and key custody"
          concepts={["cert-key-separation", "cert-emergency-deactivation", "rsfn-psti"]}
          intro="Separate certificates only help if their keys live apart. Tick what an attacker holds and read the blast radius. Then compare it with a single key that does both jobs, which the manual forbids."
        >
          <div className="space-y-4">
            <KeyDuties />
            <Callout tone="bad">
              In July and August 2025, attackers used legitimate credentials inside two PSTIs (C&amp;M Software, then Sinqia) to send
              fraudulent transfers out of participants&apos; settlement accounts. Press estimates run to hundreds of millions of reais per
              incident; there is no official consolidated figure. The BCB&apos;s response (Res. BCB 496) capped Pix at R$ 15,000 per
              transaction for participants connected through a PSTI. The cap is lifted only with an audit attesting that the participant
              keeps its signing keys away from the provider, validates message integrity before signing, and uses separate certificates per
              environment and per purpose.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="api-side">
        <Section
          title="The internet side: API Pix and dynamic QR"
          concepts={["cert-bound-token", "cert-jws-cert"]}
          intro="Between a PSP and its merchants, and between a payer's app and a receiving PSP's QR site, Pix runs on the public internet with different certificates and different rules. The tokens are bound to client certificates, and QR payloads are JWS-signed and validated against the BCB's CERTQRC list."
        >
          <ApiPixSide />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t1">
            One job per certificate: CERTPIC opens the channel, CERTPIA signs, CERTQRC serves QR sites, and the JWS key signs QR payloads. Mixing
            them is forbidden, and keeping them apart is what contains a leak.
          </Fragment>,
          <Fragment key="t2">
            The effective expiry is notAfter minus 24 hours, and activation can take 7 days. Rotate with overlap, and track the BCB&apos;s
            rotations as carefully as your own.
          </Fragment>,
          <Fragment key="t3">
            Revocation is checked offline, because the RSFN has no internet. The rules are asymmetric: keep accepting a BCB certificate
            whose status is unknown (and notify), but refuse a QR certificate whose status is unknown.
          </Fragment>,
        ]}
      />

      <ConceptList chapter={certs} />
    </>
  );
}
