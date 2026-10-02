"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented } from "@/components/ui";

type Region = "env" | "hdr" | "fields" | "sgntr" | "sig" | "si" | "sv" | "ki" | "doc";
type TNode = {
  id: string;
  depth: number;
  tag: string;
  attrs?: string;
  text?: string;
  desc: string;
  /** region this node lives in */
  at: Region;
  /** regions whose bytes this node protects */
  covers?: Region[];
  /** regions removed by a transform before hashing */
  removed?: Region[];
};

const EXC = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENV = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

function sigNodes(profile: "spi" | "dict"): TNode[] {
  const d = profile === "spi" ? 3 : 1;
  const refs: TNode[] = [
    {
      id: "ref-ki",
      depth: d + 2,
      tag: "ds:Reference",
      attrs: 'URI="#key-info-id"',
      desc: "Points at the KeyInfo by its Id. Signing KeyInfo binds the certificate identity (issuer + serial) to the signature, so nobody can swap in a different certificate reference without breaking it.",
      at: "si",
      covers: ["ki"],
    },
    { id: "ref-ki-t", depth: d + 3, tag: "ds:Transform", attrs: `Algorithm="${EXC}"`, desc: "Exclusive canonicalization of the KeyInfo subtree.", at: "si", covers: ["ki"] },
    { id: "ref-ki-dm", depth: d + 3, tag: "ds:DigestMethod", attrs: 'Algorithm="…xmlenc#sha256"', desc: "SHA-256 over the canonical bytes.", at: "si" },
    { id: "ref-ki-dv", depth: d + 3, tag: "ds:DigestValue", text: "J9fL+Qyr…bdbrM=", desc: "base64 of the 32-byte SHA-256 digest (44 characters with padding).", at: "si", covers: ["ki"] },
    profile === "spi"
      ? {
          id: "ref-hdr",
          depth: d + 2,
          tag: "ds:Reference",
          attrs: 'URI=""',
          desc: 'In the SPI, URI="" is defined to mean the BAH (<AppHdr>), not the whole document as in the generic W3C reading. The enveloped-signature transform first removes the ds:Signature element (leaving an empty <Sgntr></Sgntr>), then exc-c14n.',
          at: "si",
          covers: ["hdr", "fields", "sgntr"],
          removed: ["sig"],
        }
      : {
          id: "ref-hdr",
          depth: d + 2,
          tag: "ds:Reference",
          attrs: 'URI=""',
          desc: 'In the DICT there is no BAH: URI="" points at the root element of the XML, minus the Signature (enveloped-signature), then exc-c14n.',
          at: "si",
          covers: ["env", "fields"],
          removed: ["sig"],
        },
    { id: "ref-hdr-t1", depth: d + 3, tag: "ds:Transform", attrs: `Algorithm="${ENV}"`, desc: "Enveloped signature: drop the ds:Signature element that sits inside the content being signed. It must come first; the XSD fixes the order.", at: "si", removed: ["sig"] },
    { id: "ref-hdr-t2", depth: d + 3, tag: "ds:Transform", attrs: `Algorithm="${EXC}"`, desc: "Then canonicalize what is left.", at: "si" },
    { id: "ref-hdr-dv", depth: d + 3, tag: "ds:DigestValue", text: "D8tkpivJ…IwV+4=", desc: "SHA-256 of the canonical header (or root).", at: "si" },
  ];
  if (profile === "spi")
    refs.push(
      {
        id: "ref-doc",
        depth: d + 2,
        tag: "ds:Reference",
        attrs: "(no URI)",
        desc: "A Reference with no URI attribute. XMLDSig allows the application to define what it means; the SPI defines it as the ISO 20022 message itself, the <Document> element. This is the reference that protects the amount, the EndToEndId and the accounts.",
        at: "si",
        covers: ["doc"],
      },
      { id: "ref-doc-t", depth: d + 3, tag: "ds:Transform", attrs: `Algorithm="${EXC}"`, desc: "Exclusive canonicalization of <Document>. Its default namespace (inherited from <Envelope>) is rendered on the apex because it is visibly used.", at: "si", covers: ["doc"] },
      { id: "ref-doc-dv", depth: d + 3, tag: "ds:DigestValue", text: "B/xG0ETs…L1gMbI=", desc: "SHA-256 of the canonical Document.", at: "si", covers: ["doc"] },
    );
  return [
    { id: "sig", depth: d, tag: "ds:Signature", attrs: 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"', desc: "The XMLDSig root. Children are fixed by the Pix profile XSD (xmldsig.spi.1.0.xsd): SignedInfo, SignatureValue, KeyInfo, in this order.", at: "sig" },
    { id: "si", depth: d + 1, tag: "ds:SignedInfo", desc: "The only thing actually RSA-signed. It holds the algorithms and one digest per protected part, so signing it signs everything transitively.", at: "si", covers: ["si"] },
    { id: "cm", depth: d + 2, tag: "ds:CanonicalizationMethod", attrs: `Algorithm="${EXC}"`, desc: "How SignedInfo itself is canonicalized before signing. Pix: exclusive XML canonicalization, without comments. It is the only value the profile XSD accepts.", at: "si" },
    { id: "sm", depth: d + 2, tag: "ds:SignatureMethod", attrs: 'Algorithm="…xmldsig-more#rsa-sha256"', desc: "RSASSA-PKCS1-v1_5 with SHA-256 (RFC 4051 URI). RSA-2048 keys from an ICP-Brasil SPB-standard certificate.", at: "si" },
    ...refs,
    { id: "sv", depth: d + 1, tag: "ds:SignatureValue", text: "QfbSxaFs… (344 base64 chars)", desc: "RSA signature over c14n(SignedInfo): 256 bytes for a 2048-bit key, 344 base64 characters. Often line-wrapped; whitespace in it is insignificant because it is not inside SignedInfo.", at: "sv", covers: ["si"] },
    { id: "ki", depth: d + 1, tag: "ds:KeyInfo", attrs: 'Id="key-info-id"', desc: "Identifies the signer's certificate. The Id is required by the profile because the first Reference points at it.", at: "ki" },
    { id: "x509", depth: d + 2, tag: "ds:X509Data", desc: "Pix uses only X509IssuerSerial: the certificate itself is not embedded. The verifier must already hold it (the BC keeps participants' registered CERTPIA certificates; participants keep the BC's).", at: "ki" },
    { id: "is", depth: d + 3, tag: "ds:X509IssuerSerial", desc: "Issuer DN + serial number uniquely identify one certificate.", at: "ki" },
    { id: "in", depth: d + 4, tag: "ds:X509IssuerName", text: "CN=AC Exemplo, OU=CSPB-0, O=ICP-Brasil, C=BR", desc: "DN of the issuing certificate authority. SPB-standard CAs carry OU=CSPB-n (the code BC assigned to that CA).", at: "ki" },
    { id: "sn", depth: d + 4, tag: "ds:X509SerialNumber", text: "20200130224837516000", desc: "Certificate serial number, as a decimal integer (XSD type integer).", at: "ki" },
  ];
}

function nodes(profile: "spi" | "dict"): TNode[] {
  if (profile === "spi")
    return [
      { id: "env", depth: 0, tag: "Envelope", attrs: 'xmlns="https://www.bcb.gov.br/pi/pacs.008/1.16"', desc: "The SPI wrapper: one AppHdr and one Document. Not signed as a whole; its namespace is inherited by both children.", at: "env" },
      { id: "hdr", depth: 1, tag: "AppHdr", desc: "The ISO 20022 Business Application Header (head.001): who sends to whom, message id and type. Signed by the URI=\"\" reference.", at: "hdr" },
      { id: "fields", depth: 2, tag: "Fr · To · BizMsgIdr · MsgDefIdr · CreDt", desc: "Sender ISPB (Fr/FIId/FinInstnId/Othr/Id), receiver (00038166 = BC), message id, message definition (pacs.008.spi.1.16), creation time.", at: "fields" },
      { id: "sgntr", depth: 2, tag: "Sgntr", desc: "The BAH's signature slot. Holds exactly one ds:Signature. After the enveloped transform it hashes as <Sgntr></Sgntr>.", at: "sgntr" },
      ...sigNodes("spi"),
      { id: "doc", depth: 1, tag: "Document", desc: "The ISO 20022 business message (here FIToFICstmrCdtTrf). Signed by the Reference without URI.", at: "doc" },
    ];
  return [
    { id: "env", depth: 0, tag: "CreateEntryRequest", attrs: "(any DICT write request or response)", desc: "DICT requests are plain XML (not ISO 20022), so there is no BAH. The signature sits directly under the root element. GET lookups are not signed; every DICT response is.", at: "env" },
    ...sigNodes("dict"),
    { id: "fields", depth: 1, tag: "Entry · Reason · RequestId …", desc: "The business payload. In the DICT API examples the Signature element is the first child of the root, followed by the payload.", at: "fields" },
  ];
}

const BOXES: Record<"spi" | "dict", Partial<Record<Region, { x: number; y: number; w: number; h: number; label: string }>>> = {
  spi: {
    env: { x: 4, y: 4, w: 392, h: 292, label: "Envelope" },
    hdr: { x: 14, y: 24, w: 372, h: 176, label: "AppHdr" },
    fields: { x: 24, y: 44, w: 352, h: 24, label: "Fr · To · BizMsgIdr · MsgDefIdr · CreDt" },
    sgntr: { x: 24, y: 76, w: 352, h: 116, label: "Sgntr" },
    sig: { x: 34, y: 96, w: 332, h: 88, label: "ds:Signature" },
    si: { x: 44, y: 116, w: 130, h: 60, label: "SignedInfo" },
    sv: { x: 182, y: 116, w: 86, h: 60, label: "SignatureValue" },
    ki: { x: 276, y: 116, w: 82, h: 60, label: "KeyInfo" },
    doc: { x: 14, y: 208, w: 372, h: 80, label: "Document (pacs.008)" },
  },
  dict: {
    env: { x: 4, y: 4, w: 392, h: 292, label: "<root element>" },
    sig: { x: 14, y: 26, w: 372, h: 128, label: "Signature" },
    si: { x: 26, y: 52, w: 150, h: 90, label: "SignedInfo" },
    sv: { x: 184, y: 52, w: 96, h: 90, label: "SignatureValue" },
    ki: { x: 288, y: 52, w: 86, h: 90, label: "KeyInfo" },
    fields: { x: 14, y: 166, w: 372, h: 122, label: "Entry · Reason · RequestId …" },
  },
};

const ORDER: Region[] = ["env", "hdr", "fields", "sgntr", "sig", "si", "sv", "ki", "doc"]; // parents before children

export function SignatureTree() {
  const [profile, setProfile] = useState<"spi" | "dict">("spi");
  const list = nodes(profile);
  const [sel, setSel] = useState("ref-doc");
  const node = list.find((n) => n.id === sel) ?? list[0];
  const covers = new Set(node.covers ?? []);
  const removed = new Set(node.removed ?? []);
  const boxes = BOXES[profile];

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={profile}
          onChange={(v) => {
            setProfile(v);
            setSel(v === "spi" ? "ref-doc" : "ref-hdr");
          }}
          options={[
            { value: "spi", label: "SPI message (3 References)" },
            { value: "dict", label: "DICT request (2 References)" },
          ]}
        />
        <span className="text-xs text-faint">click any element</span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="Element tree" bodyClassName="p-2">
          <ul className="font-mono text-[11.5px] leading-[1.55]">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setSel(n.id)}
                  className={clsx(
                    "block w-full truncate rounded px-1.5 text-left transition",
                    n.id === sel ? "bg-amber-400/15 text-ink" : "text-muted hover:bg-panel-2 hover:text-ink",
                  )}
                  style={{ paddingLeft: 6 + n.depth * 12 }}
                  title={n.tag}
                >
                  <span className={n.tag.startsWith("ds:") ? "text-amber-300" : "text-sky-300"}>&lt;{n.tag}</span>
                  {n.attrs && <span className="text-faint"> {n.attrs}</span>}
                  <span className={n.tag.startsWith("ds:") ? "text-amber-300" : "text-sky-300"}>&gt;</span>
                  {n.text && <span className="text-ink/80">{n.text}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title="What it protects">
            <svg viewBox="0 0 400 300" className="w-full" role="img" aria-label="envelope layout with protected regions highlighted">
              <defs>
                <pattern id="hatch-dsig" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="2" opacity="0.5" />
                </pattern>
              </defs>
              {ORDER.map((r) => {
                const b = boxes[r];
                if (!b) return null;
                const cov = covers.has(r);
                const rem = removed.has(r);
                const here = node.at === r;
                return (
                  <g key={r}>
                    <rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={6}
                      fill={rem ? "url(#hatch-dsig)" : cov ? "rgba(52,211,153,0.16)" : "#11141b"}
                      fillOpacity={1}
                      stroke={here ? "#f5a524" : cov ? "#34d399" : "#242a38"}
                      strokeWidth={here ? 2 : 1}
                    />
                    <text x={b.x + 7} y={b.y + 14} fontSize={10} fill={cov ? "#34d399" : rem ? "#f87171" : "#8a93a8"} fontFamily="ui-monospace, monospace">
                      {b.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
              <span>
                <span className="text-ok">■</span> hashed by this node
              </span>
              <span>
                <span className="text-bad">▨</span> removed by enveloped-signature
              </span>
              <span>
                <span className="text-amber-400">□</span> where it lives
              </span>
            </div>
          </Panel>
          <Panel title={<span className="font-mono normal-case">&lt;{node.tag}&gt;</span>}>
            <p className="text-sm leading-relaxed text-muted">{node.desc}</p>
            {node.attrs && <p className="mt-2 font-mono text-[11px] break-all text-faint">{node.attrs}</p>}
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: click the three ds:Reference elements in turn and watch what turns green. Then click ds:SignatureValue: it covers only
        SignedInfo, and SignedInfo covers everything else through the digests. Switch to DICT to see the two-reference variant.
      </p>
    </div>
  );
}
