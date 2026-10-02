import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { qrcode } from "@/content/qrcode";
import { BrCodeBuilder } from "@/components/qrcode/BrCodeBuilder";
import { BrCodeInspector } from "@/components/qrcode/BrCodeInspector";
import { CrcStepper } from "@/components/qrcode/CrcStepper";
import { QrAnatomy } from "@/components/qrcode/QrAnatomy";
import { QrKinds } from "@/components/qrcode/QrKinds";
import { DynamicFetch } from "@/components/qrcode/DynamicFetch";
import { CobvCalculator } from "@/components/qrcode/CobvCalculator";

export const metadata = { title: "QR codes & BR Code" };

export default function Page() {
  return (
    <>
      <PageHeader n="02" title="QR codes & BR Code" color={CHAPTER_COLOR.qrcode}>
        Most Pix payments start with a string of about 120 characters. It follows the EMV merchant-presented QR format (BR Code), where every field is a two-digit ID,
        a two-digit length and a value, and a CRC16 closes the string. A static code puts the Pix key and amount right in the image. A dynamic code holds only a short
        capability URL. The payer&apos;s PSP fetches that URL over HTTPS, checks a JWS signature against the receiving PSP&apos;s registered domain, and only then shows the
        charge. This chapter builds, parses, checksums, renders and fetches those codes for real, following the BCB&apos;s <em>Manual de Padrões para Iniciação do Pix</em>{" "}
        v2.10.0 and the security manual.
      </PageHeader>

      <div id="anatomy">
        <Section
          title="Anatomy of a BR Code"
          concepts={["br-code", "merchant-account-information", "point-of-initiation", "pix-copia-e-cola"]}
          intro="Fill in the fields a merchant would and watch the Pix Copia e Cola string assemble itself: root fields in a fixed order, template 26 nesting the Pix data, 62 holding the txid, and 63 the CRC over everything before it."
        >
          <BrCodeBuilder />
        </Section>
      </div>

      <div id="parser">
        <Section
          title="Parse and validate any code"
          concepts={["emv-tlv", "pix-gui", "qr-txid"]}
          intro="A payer app has to treat every scanned string as hostile input. The parser walks the TLV recursively, recognises the Pix template by its GUI, and checks order, mandatory fields, lengths (59 ≤ 25, 60 ≤ 15, 26 ≤ 99), key and URL formats, the txid charset and the CRC. All presets except the last are copied verbatim from the Manual."
        >
          <BrCodeInspector />
        </Section>
      </div>

      <div id="crc">
        <Section
          title="CRC16/CCITT-FALSE, bit by bit"
          concepts={["crc16-ccitt"]}
          intro={
            <>
              The Manual specifies polynomial 0x1021 and initial value 0xFFFF, computed over the whole payload including the literal <span className="font-mono">6304</span>.
              Each byte is XORed into the high half of a 16-bit register, then shifted out one bit at a time, with an XOR of the polynomial whenever a 1 falls off the top.
            </>
          }
        >
          <CrcStepper />
        </Section>
      </div>

      <div id="matrix">
        <Section
          title="From string to modules: a real QR encoder"
          concepts={["qr-version-ecc", "qr-dynamic"]}
          intro="The encoder below is written from scratch for this page: byte mode, error-correction level M, versions 1–20, Reed–Solomon over GF(256), block interleaving, and penalty-based mask selection. It is checked module-for-module against a reference implementation. The QR grows with every byte, and this is one practical reason dynamic codes carry a URL."
        >
          <QrAnatomy />
        </Section>
      </div>

      <div id="kinds">
        <Section
          title="Static, dynamic, composite — and Saque/Troco"
          concepts={["qr-static", "qr-dynamic", "qr-composite", "qr-saque-troco"]}
          intro="Ten flavours of Pix QR side by side. For each one: what is in the image, what the payer's PSP fetches, and the rules that apply. Composite QRs add template 80 with a recurrence URL for Pix Automático authorisation journeys 2, 3 and 4."
        >
          <QrKinds />
        </Section>
      </div>

      <div id="jws">
        <Section
          title="Fetching a dynamic QR: TLS, domain, JWS"
          concepts={["qr-location-url", "qr-jws", "qr-jwks", "qr-certificates"]}
          intro="This is the validation sequence from the Manual de Segurança do SFN (Vol. II §4), run with real RSA keys generated in your browser. The payload is signed with PS256 or RS256 and verified with crypto.subtle. Inject faults and see which check catches each one."
        >
          <DynamicFetch />
          <div className="mt-4">
            <Callout tone="info">
              In the order the payer&apos;s app runs them: TLS ≥ 1.2 → EV certificate registered in Pix whose CN/SAN matches the host → JWS header → JWK Set from the{" "}
              <span className="font-mono">jku</span> on that same site, matched by <span className="font-mono">kid</span>/<span className="font-mono">x5t</span> → x5c chain →
              signature. The payload is parsed only after all of these pass. Apps may preload JWK Sets, for example from a PSP&apos;s{" "}
              <span className="font-mono">/.well-known/</span> host-meta, to avoid fetching jku on every scan.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="cobv">
        <Section
          title="Due-date charges: the cobv calculator"
          concepts={["cobv-calculation"]}
          intro="For a cobv, the receiver's PSP computes the amount when the payload is fetched, using the payer's intended payment date (DPP) and municipality (codMun). These are the Anexo III formulas: abatimento, then desconto (fixed dates or per day of anticipation), juros (8 modalities, calendar or business days, factor truncated to 6 decimals) and multa (charged once if paid late)."
        >
          <CobvCalculator />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t0">
            A BR Code is plain TLV plus a CRC16 (0x1021, 0xFFFF, over everything including <span className="font-mono">6304</span>). The CRC catches typos. It does not
            prove who issued the code.
          </Fragment>,
          <Fragment key="t1">
            Static codes carry their data in the image, so they cannot be changed or reconciled strictly. Dynamic and composite codes carry a 77-character capability URL,
            and the charge lives behind it as a signed JWS.
          </Fragment>,
          <Fragment key="t2">
            Trust comes from the domain, not just the math. A valid signature is accepted only when the key comes from the jku on the registered EV-certified Pix QR host,
            served over TLS ≥ 1.2.
          </Fragment>,
        ]}
      />
      <ConceptList chapter={qrcode} />
    </>
  );
}
