/**
 * XMLDSig as the SPI profile uses it (Manual de Segurança do Pix, sec. 3):
 * enveloped signature in AppHdr/Sgntr, exc-c14n, rsa-sha256, sha256, and
 * exactly three References:
 *   URI="#<KeyInfo Id>"  → the KeyInfo element            [exc-c14n]
 *   URI=""               → the AppHdr (BAH)               [enveloped-signature, exc-c14n]
 *   (no URI)             → the Document (ISO 20022 body)  [exc-c14n]
 * Real crypto via WebCrypto (RSASSA-PKCS1-v1_5 + SHA-256).
 */
import {
  attr,
  canonicalize,
  childEls,
  findFirst,
  fromB64,
  latin1,
  parseXml,
  sha256,
  textOf,
  toB64,
  utf8,
  wrap76,
  type C14nMode,
  type XElem,
} from "./c14n";

export const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
export const ALG = {
  excC14n: "http://www.w3.org/2001/10/xml-exc-c14n#",
  incC14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  enveloped: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  rsaSha256: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  sha256: "http://www.w3.org/2001/04/xmlenc#sha256",
};

export const ISSUER = "CN=AC Exemplo SPB, OU=CSPB-0, O=ICP-Brasil, C=BR";
export const KEYINFO_ID = "key-info-id";

export function unsignedPacs008(amount = "1500.00", debtor = "Fulano da Silva", extraNs = ""): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Envelope xmlns="https://www.bcb.gov.br/pi/pacs.008/1.16"${extraNs}>
 <AppHdr>
  <Fr><FIId><FinInstnId><Othr><Id>99999010</Id></Othr></FinInstnId></FIId></Fr>
  <To><FIId><FinInstnId><Othr><Id>00038166</Id></Othr></FinInstnId></FIId></To>
  <BizMsgIdr>M9999901012345678901234567890123</BizMsgIdr>
  <MsgDefIdr>pacs.008.spi.1.16</MsgDefIdr>
  <CreDt>2026-10-02T13:30:12.000Z</CreDt>
  <Sgntr/>
 </AppHdr>
 <Document>
  <FIToFICstmrCdtTrf>
   <GrpHdr>
    <MsgId>M9999901012345678901234567890123</MsgId>
    <CreDtTm>2026-10-02T13:30:12.000Z</CreDtTm>
    <NbOfTxs>1</NbOfTxs>
    <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
   </GrpHdr>
   <CdtTrfTxInf>
    <PmtId><EndToEndId>E9999901020261002133012345678901</EndToEndId></PmtId>
    <IntrBkSttlmAmt Ccy="BRL">${amount}</IntrBkSttlmAmt>
    <Dbtr><Nm>${debtor}</Nm></Dbtr>
    <DbtrAgt><FinInstnId><ClrSysMmbId><MmbId>99999010</MmbId></ClrSysMmbId></FinInstnId></DbtrAgt>
    <CdtrAgt><FinInstnId><ClrSysMmbId><MmbId>99999020</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
   </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
 </Document>
</Envelope>`;
}

export type SignerOpts = {
  /** c14n actually computed by the signer (it always *declares* exc-c14n) */
  c14n: C14nMode;
  /** what the signer removes for the enveloped transform: just ds:Signature (correct) or the whole Sgntr (bug) */
  envelopedRemoves: "signature" | "sgntr";
  /** bytes hashed: UTF-8 (correct) or Latin-1 (bug) */
  encoding: "utf8" | "latin1";
  /** wrap SignatureValue base64 at 76 columns, like many libraries do */
  wrap: boolean;
};
export const GOOD_SIGNER: SignerOpts = { c14n: "exc", envelopedRemoves: "signature", encoding: "utf8", wrap: true };

export function signatureXml(d: { keyInfo: string; appHdr: string; doc: string }, sigValue: string, serial: string, ind = "   "): string {
  const i = (n: number) => "\n" + ind + " ".repeat(n);
  return (
    `<ds:Signature xmlns:ds="${NS_DS}">` +
    `${i(1)}<ds:SignedInfo>` +
    `${i(2)}<ds:CanonicalizationMethod Algorithm="${ALG.excC14n}"/>` +
    `${i(2)}<ds:SignatureMethod Algorithm="${ALG.rsaSha256}"/>` +
    `${i(2)}<ds:Reference URI="#${KEYINFO_ID}">` +
    `${i(3)}<ds:Transforms>${i(4)}<ds:Transform Algorithm="${ALG.excC14n}"/>${i(3)}</ds:Transforms>` +
    `${i(3)}<ds:DigestMethod Algorithm="${ALG.sha256}"/>` +
    `${i(3)}<ds:DigestValue>${d.keyInfo}</ds:DigestValue>` +
    `${i(2)}</ds:Reference>` +
    `${i(2)}<ds:Reference URI="">` +
    `${i(3)}<ds:Transforms>${i(4)}<ds:Transform Algorithm="${ALG.enveloped}"/>${i(4)}<ds:Transform Algorithm="${ALG.excC14n}"/>${i(3)}</ds:Transforms>` +
    `${i(3)}<ds:DigestMethod Algorithm="${ALG.sha256}"/>` +
    `${i(3)}<ds:DigestValue>${d.appHdr}</ds:DigestValue>` +
    `${i(2)}</ds:Reference>` +
    `${i(2)}<ds:Reference>` +
    `${i(3)}<ds:Transforms>${i(4)}<ds:Transform Algorithm="${ALG.excC14n}"/>${i(3)}</ds:Transforms>` +
    `${i(3)}<ds:DigestMethod Algorithm="${ALG.sha256}"/>` +
    `${i(3)}<ds:DigestValue>${d.doc}</ds:DigestValue>` +
    `${i(2)}</ds:Reference>` +
    `${i(1)}</ds:SignedInfo>` +
    `${i(1)}<ds:SignatureValue>${sigValue.includes("\n") ? "\n" + sigValue + i(1) : sigValue}</ds:SignatureValue>` +
    `${i(1)}<ds:KeyInfo Id="${KEYINFO_ID}">` +
    `${i(2)}<ds:X509Data>${i(3)}<ds:X509IssuerSerial>` +
    `${i(4)}<ds:X509IssuerName>${ISSUER}</ds:X509IssuerName>` +
    `${i(4)}<ds:X509SerialNumber>${serial}</ds:X509SerialNumber>` +
    `${i(3)}</ds:X509IssuerSerial>${i(2)}</ds:X509Data>` +
    `${i(1)}</ds:KeyInfo>` +
    `\n${ind}</ds:Signature>`
  );
}

function insertSignature(unsigned: string, sig: string): string {
  const re = /<Sgntr\s*\/>|<Sgntr>\s*<\/Sgntr>/;
  if (!re.test(unsigned)) throw new Error("no empty <Sgntr/> element found in the AppHdr");
  return unsigned.replace(re, `<Sgntr>\n   ${sig}\n  </Sgntr>`);
}

const isSignature = (e: XElem) => e.local === "Signature" && e.uri === NS_DS;

export function locate(root: XElem) {
  const appHdr = findFirst(root, (e) => e.local === "AppHdr");
  const doc = findFirst(root, (e) => e.local === "Document");
  const sig = findFirst(root, isSignature);
  const signedInfo = sig ? findFirst(sig, (e) => e.local === "SignedInfo" && e.uri === NS_DS) : null;
  return { appHdr, doc, sig, signedInfo };
}

export type SignStep = { n: number; label: string; detail: string; c14n?: string; value?: string };

export async function signMessage(unsigned: string, key: CryptoKey, serial: string, o: SignerOpts = GOOD_SIGNER): Promise<{ xml: string; steps: SignStep[] }> {
  const steps: SignStep[] = [];
  const enc = (s: string) => (o.encoding === "utf8" ? utf8(s) : latin1(s));
  const placeholder = { keyInfo: "", appHdr: "", doc: "" };
  const skeleton = insertSignature(unsigned, signatureXml(placeholder, "", serial));
  const root = parseXml(skeleton);
  const { appHdr, doc, sig } = locate(root);
  if (!appHdr || !doc || !sig) throw new Error("message must contain AppHdr and Document");
  steps.push({ n: 1, label: "Obtain the full message", detail: `${unsigned.length} chars, root <${root.qname}>` });
  const keyInfo = findFirst(sig, (e) => e.local === "KeyInfo")!;
  steps.push({ n: 2, label: "Build <KeyInfo>", detail: `X509IssuerSerial = ${ISSUER} / ${serial}` });
  steps.push({ n: 3, label: "Extract the BAH (<AppHdr>)", detail: "the business header, including the (still empty) signature slot" });
  steps.push({ n: 4, label: "Extract the ISO 20022 message (<Document>)", detail: "the pacs.008 body" });
  steps.push({ n: 5, label: "Choose algorithms in <SignedInfo>", detail: "CanonicalizationMethod = exc-c14n · SignatureMethod = rsa-sha256" });
  steps.push({ n: 6, label: "Create the 3 <Reference> elements", detail: '#key-info-id [exc-c14n] · URI="" [enveloped, exc-c14n] · no URI [exc-c14n]' });

  const kiC = canonicalize(keyInfo, { mode: o.c14n });
  const ahC = canonicalize(appHdr, {
    mode: o.c14n,
    exclude: o.envelopedRemoves === "signature" ? isSignature : (e) => e.local === "Sgntr",
  });
  const dC = canonicalize(doc, { mode: o.c14n });
  steps.push({ n: 7, label: "Apply the transforms", detail: "enveloped-signature on the AppHdr, then exclusive canonicalization of each", c14n: ahC });
  const d = {
    keyInfo: toB64(await sha256(enc(kiC))),
    appHdr: toB64(await sha256(enc(ahC))),
    doc: toB64(await sha256(enc(dC))),
  };
  steps.push({ n: 8, label: "SHA-256 each result → <DigestValue>", detail: `KeyInfo ${d.keyInfo.slice(0, 12)}… · AppHdr ${d.appHdr.slice(0, 12)}… · Document ${d.doc.slice(0, 12)}…` });

  const withDigests = insertSignature(unsigned, signatureXml(d, "", serial));
  const si = locate(parseXml(withDigests)).signedInfo!;
  const siC = canonicalize(si, { mode: o.c14n });
  const sigBytes = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, enc(siC)));
  const b64 = toB64(sigBytes);
  steps.push({ n: 9, label: "Canonicalize <SignedInfo> and sign it (RSA-SHA256)", detail: `${siC.length} canonical chars → ${sigBytes.length}-byte RSA signature`, c14n: siC });
  const sigValue = o.wrap ? wrap76(b64) : b64;
  const xml = insertSignature(unsigned, signatureXml(d, sigValue, serial));
  steps.push({ n: 10, label: "Insert into <SignatureValue>", detail: `base64, ${b64.length} chars${o.wrap ? ", wrapped at 76 columns" : ""}`, value: b64 });
  return { xml, steps };
}

/* -------------------------------- verify --------------------------------- */

export type VStatus = "ok" | "fail" | "skip";
export type VStep = { id: string; n: string; label: string; status: VStatus; detail: string; expected?: string; computed?: string };
export type Registry = Map<string, { key: CryptoKey; label: string }>;
export type VerifierOpts = { lenientBase64: boolean };

export async function verifyMessage(xml: string, registry: Registry, vo: VerifierOpts = { lenientBase64: true }): Promise<{ ok: boolean; failedAt: string | null; steps: VStep[] }> {
  const steps: VStep[] = [];
  const fail = (s: VStep) => {
    steps.push(s);
    return { ok: false, failedAt: s.id, steps };
  };
  let root: XElem;
  try {
    root = parseXml(xml);
  } catch (e) {
    return fail({ id: "parse", n: "0", label: "Parse XML", status: "fail", detail: (e as Error).message });
  }
  steps.push({ id: "parse", n: "0", label: "Parse XML", status: "ok", detail: `root <${root.qname}> in ${root.uri || "no namespace"}` });
  const { appHdr, doc, sig, signedInfo } = locate(root);
  if (!sig || !signedInfo || !appHdr || !doc) return fail({ id: "structure", n: "0", label: "Find AppHdr / Document / Sgntr/ds:Signature", status: "fail", detail: "missing element" });

  // profile checks (xmldsig.spi.1.0.xsd restricts algorithms and fixes 3 References)
  const refs = childEls(signedInfo, "Reference");
  const cm = attr(childEls(signedInfo, "CanonicalizationMethod")[0] ?? signedInfo, "Algorithm");
  const sm = attr(childEls(signedInfo, "SignatureMethod")[0] ?? signedInfo, "Algorithm");
  if (refs.length !== 3 || cm !== ALG.excC14n || sm !== ALG.rsaSha256)
    return fail({ id: "structure", n: "0", label: "Profile (xmldsig.spi.1.0.xsd)", status: "fail", detail: `${refs.length} References, c14n=${cm}, sig=${sm}` });
  steps.push({ id: "structure", n: "0", label: "Profile (xmldsig.spi.1.0.xsd)", status: "ok", detail: "3 References · exc-c14n · rsa-sha256 · sha256" });

  // 1–6: recompute every reference digest
  const names = ["KeyInfo", "AppHdr", "Document"] as const;
  const order: Record<string, number> = {};
  for (let k = 0; k < refs.length; k++) {
    const ref = refs[k];
    const uri = attr(ref, "URI");
    let target: XElem | null;
    let name: string;
    if (uri === undefined) {
      target = doc;
      name = "Document";
    } else if (uri === "") {
      target = appHdr;
      name = "AppHdr";
    } else if (uri.startsWith("#")) {
      const id = uri.slice(1);
      target = findFirst(root, (e) => attr(e, "Id") === id);
      name = target?.local === "KeyInfo" ? "KeyInfo" : (target?.local ?? uri);
    } else {
      return fail({ id: `ref-${k}`, n: "1–6", label: `Reference URI="${uri}"`, status: "fail", detail: "external URIs are not allowed" });
    }
    order[name] = k;
    if (!target) return fail({ id: `ref-${k}`, n: "1–6", label: `Reference ${uri}`, status: "fail", detail: "referenced element not found" });
    const transforms = childEls(childEls(ref, "Transforms")[0] ?? ref, "Transform").map((t) => attr(t, "Algorithm"));
    const enveloped = transforms.includes(ALG.enveloped);
    const mode: C14nMode = transforms.includes(ALG.incC14n) ? "inc" : "exc";
    const c = canonicalize(target, { mode, exclude: enveloped ? isSignature : undefined });
    const computed = toB64(await sha256(utf8(c)));
    const expectedRaw = textOf(childEls(ref, "DigestValue")[0] ?? ref);
    let expected = expectedRaw.trim();
    try {
      expected = toB64(fromB64(expectedRaw, true)); // compare decoded bytes, as real verifiers do
    } catch {
      /* keep the raw text; comparison will fail */
    }
    const label = `Digest of <${name}>${enveloped ? " (minus ds:Signature)" : ""}`;
    if (computed !== expected)
      return fail({ id: `ref-${name}`, n: "5–6", label, status: "fail", detail: "recomputed SHA-256 ≠ DigestValue → this part was changed after signing", expected, computed });
    steps.push({ id: `ref-${name}`, n: "5–6", label, status: "ok", detail: `${c.length} canonical chars`, expected, computed });
  }
  for (const nm of names) if (order[nm] === undefined) return fail({ id: `ref-${nm}`, n: "1–6", label: `Reference for ${nm}`, status: "fail", detail: "missing" });

  // 8: signature value
  const sv = childEls(sig, "SignatureValue")[0];
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = fromB64(textOf(sv ?? sig), vo.lenientBase64);
  } catch (e) {
    return fail({ id: "sigvalue", n: "8", label: "Decode <SignatureValue>", status: "fail", detail: (e as Error).message });
  }
  steps.push({ id: "sigvalue", n: "8", label: "Decode <SignatureValue>", status: "ok", detail: `${sigBytes.length} bytes` });

  // 9: certificate from KeyInfo
  const ki = findFirst(sig, (e) => e.local === "KeyInfo");
  const issuer = ki ? textOf(findFirst(ki, (e) => e.local === "X509IssuerName") ?? ki).trim() : "";
  const serial = ki ? textOf(findFirst(ki, (e) => e.local === "X509SerialNumber") ?? ki).trim() : "";
  const entry = registry.get(`${issuer}|${serial}`);
  if (!entry) return fail({ id: "cert", n: "9", label: "Look up certificate (issuer + serial)", status: "fail", detail: `no active CERTPIA registered for ${issuer} / ${serial}` });
  steps.push({ id: "cert", n: "9", label: "Look up certificate (issuer + serial)", status: "ok", detail: entry.label });

  // 10–11: canonicalize SignedInfo and verify
  const siC = canonicalize(signedInfo, { mode: "exc" });
  const good = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, entry.key, sigBytes, utf8(siC));
  if (!good)
    return fail({ id: "rsa", n: "10–11", label: "RSA-SHA256 verify over c14n(SignedInfo)", status: "fail", detail: "SignedInfo (or the signature) changed, or the key does not match" });
  steps.push({ id: "rsa", n: "10–11", label: "RSA-SHA256 verify over c14n(SignedInfo)", status: "ok", detail: `${siC.length} canonical chars, signature valid` });
  return { ok: true, failedAt: null, steps };
}

/** Re-sign trick an attacker could try: change the Document, then recompute its DigestValue in place. */
export async function recomputeDocDigest(xml: string): Promise<string> {
  const root = parseXml(xml);
  const { doc } = locate(root);
  if (!doc) return xml;
  const d = toB64(await sha256(utf8(canonicalize(doc, { mode: "exc" }))));
  // the third <ds:DigestValue> belongs to the Document reference
  let n = 0;
  return xml.replace(/<ds:DigestValue>[^<]*<\/ds:DigestValue>/g, (m) => (++n === 3 ? `<ds:DigestValue>${d}</ds:DigestValue>` : m));
}

export async function generateRsaKey(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
}
