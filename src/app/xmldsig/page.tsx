import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { xmldsig } from "@/content/xmldsig";
import { C14nPlayground } from "@/components/xmldsig/C14nPlayground";
import { SignatureTree } from "@/components/xmldsig/SignatureTree";
import { SignVerifyLab } from "@/components/xmldsig/SignVerifyLab";
import { SpiChecks } from "@/components/xmldsig/SpiChecks";
import { Throughput } from "@/components/xmldsig/Throughput";
import { Pitfalls } from "@/components/xmldsig/Pitfalls";

export const metadata = { title: "XMLDSig signatures" };

export default function Page() {
  return (
    <>
      <PageHeader n="09" title="XMLDSig signatures" color={CHAPTER_COLOR.xmldsig}>
        Every message a direct participant sends to the SPI must be digitally signed, and everything the BC sends back is signed too. The
        format is W3C XML Signature, profiled tightly by the <em>Manual de Segurança do Pix</em>: exclusive canonicalization, SHA-256
        digests, RSA-SHA256, and exactly three references covering the KeyInfo, the business header and the ISO 20022 document. The hard
        part is not the RSA math but agreeing on the exact bytes that were hashed. Everything on this page runs for real in your browser:
        a canonicalizer checked against libxml2, SHA-256 and RSA-2048 keys from WebCrypto.
      </PageHeader>

      <div id="c14n">
        <Section
          title="Canonicalization: same meaning, same bytes"
          concepts={["dsig-c14n", "dsig-exc-c14n", "dsig-visibly-utilized"]}
          intro="A digest is computed over bytes, and XML offers many byte sequences for one document. Canonical XML picks one. Edit either side: the canonical output and its SHA-256 are recomputed on every keystroke, and the first differing character is highlighted."
        >
          <C14nPlayground />
        </Section>
      </div>

      <div id="structure">
        <Section
          title="Anatomy of the signature in AppHdr/Sgntr"
          concepts={["dsig-xmldsig", "dsig-sgntr", "dsig-signedinfo", "dsig-reference", "dsig-three-references", "dsig-enveloped", "dsig-keyinfo", "dsig-dict-signature"]}
          intro={
            <>
              The structure follows the manual&apos;s pacs.008 example and the profile schema <code>xmldsig.spi.1.0.xsd</code> shipped with
              the SPI catalog, which accepts one value per algorithm, exactly three <code>Reference</code> elements, at most two transforms
              each, and only <code>X509IssuerSerial</code> in <code>KeyInfo</code>.
            </>
          }
        >
          <div className="space-y-4">
            <SignatureTree />
            <Callout tone="info">
              The SPI gives two <code>Reference</code> forms its own meaning: <code>URI=&quot;&quot;</code> is the <code>AppHdr</code>{" "}
              (in generic XMLDSig it would be the whole document) and a <code>Reference</code> with no <code>URI</code> is the{" "}
              <code>Document</code>. Off-the-shelf libraries need a custom reference resolver for this, which is where many first
              integrations go wrong.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="sign">
        <Section
          title="Sign, tamper, verify"
          concepts={["dsig-rsa-sha256", "dsig-digest-vs-signature"]}
          intro="A real pacs.008 signed with a fresh RSA-2048 key, following the manual's ten signing steps. The receiver side runs the twelve verification steps against whatever is in the text box. Use the buttons or edit the XML by hand."
        >
          <SignVerifyLab />
        </Section>
      </div>

      <div id="spi-checks">
        <Section
          title="What the SPI checks, and how it says no"
          concepts={["dsig-store-then-validate", "dsig-admi002", "dsig-bc-signed", "dsig-non-repudiation"]}
          intro="Signature verification is one gate in a longer pipeline. Where a message fails decides what you get back: a refused connection, a TLS alert, an HTTP error, an asynchronous admi.002, or a pacs.002 rejection. Toggle faults to see which gate fires first."
        >
          <div className="space-y-4">
            <SpiChecks />
            <Callout>
              Signed messages are also evidence. The Security Manual requires keeping the full XML envelope of every ICOM message sent and
              received, signature and certificate data included, for 10 years, and archiving every certificate ever used (with its public key)
              so old signatures can be re-verified. Private keys must never be part of that archive.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="performance">
        <Section
          title="Signing at Pix volume"
          concepts={["dsig-hsm"]}
          intro="Every payment costs each side roughly one RSA private-key operation plus one or two verifications. Benchmark your own browser, then size the signing tier for a PSP's share of national peak traffic."
        >
          <Throughput />
        </Section>
      </div>

      <div id="pitfalls">
        <Section
          title="Pitfalls that break real integrations"
          intro="Each case below signs a fresh message, introduces one realistic bug between signer and verifier, and runs the full verification. Most of them pass every unit test that signs and verifies with the same library."
        >
          <Pitfalls />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t1">
            Canonicalization decides what &quot;the same message&quot; means. Exclusive C14N absorbs attribute order, quoting and empty-tag
            style, but whitespace between elements, prefixes and text encodings are all signed bytes.
          </Fragment>,
          <Fragment key="t2">
            Three digests are signed indirectly through one RSA signature over <code>SignedInfo</code>. A digest failure means the content
            changed; a signature failure means <code>SignedInfo</code>, the key or the signature changed.
          </Fragment>,
          <Fragment key="t3">
            A 201 from the ICOM is not an acceptance. Signature problems arrive later as admi.002 with free-text reasons, so log the
            PI-ResourceId and the exact bytes you sent.
          </Fragment>,
        ]}
      />

      <ConceptList chapter={xmldsig} />
    </>
  );
}
