"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Panel, Stat } from "@/components/ui";
import { GOOD_SIGNER, signMessage, unsignedPacs008, verifyMessage, type SignerOpts, type VerifierOpts } from "./dsig";
import { demoKeys, registryOf, SERIAL_A } from "./keys";
import { VerifySteps } from "./SignVerifyLab";

type Pit = {
  id: string;
  title: string;
  tone: "bad" | "ok";
  what: string;
  fix: string;
  signer?: Partial<SignerOpts>;
  verifier?: Partial<VerifierOpts>;
  amount?: string;
  debtor?: string;
  extraNs?: string;
  /** what happens to the bytes between signer and verifier */
  mutate?: (xml: string) => string;
};

const PITS: Pit[] = [
  {
    id: "pretty",
    title: "Pretty-printing after signing",
    tone: "bad",
    what: "A logging/HTTP middleware re-indents the XML before it leaves. Whitespace between elements is text, c14n keeps it, so the Document digest changes.",
    fix: "Sign the exact bytes you send, as the last step. Never re-serialize a signed message.",
    mutate: (x) => x.replace("<PmtId><EndToEndId>", "<PmtId>\n     <EndToEndId>"),
  },
  {
    id: "inclusive",
    title: "Inclusive c14n of a subtree",
    tone: "bad",
    what: "The Envelope declares an unused xmlns:xsi. The signer's library computes inclusive c14n (while declaring exc-c14n), which drags xmlns:xsi into every canonical subtree. The verifier uses exclusive c14n and gets different bytes.",
    fix: "Use exclusive c14n everywhere (http://www.w3.org/2001/10/xml-exc-c14n#), for every Transform and for SignedInfo.",
    signer: { c14n: "inc" },
    extraNs: ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  },
  {
    id: "sgntr",
    title: "Enveloped transform removes too much",
    tone: "bad",
    what: "The signer drops the whole <Sgntr> element when hashing the AppHdr. The enveloped-signature transform removes only ds:Signature, so the verifier hashes <Sgntr></Sgntr> and gets a different AppHdr digest.",
    fix: "Remove exactly the ds:Signature element; keep the empty Sgntr. Apply enveloped-signature before c14n, in that order.",
    signer: { envelopedRemoves: "sgntr" },
  },
  {
    id: "latin1",
    title: "Hashing Latin-1 instead of UTF-8",
    tone: "bad",
    what: "The debtor is “João Gonçalves”. The signer hashes ISO-8859-1 bytes (ã = E3), the verifier UTF-8 (ã = C3 A3). Pure ASCII messages would hide the bug for months.",
    fix: "Canonical XML is always UTF-8. Hash the UTF-8 encoding of the canonical string, and send the message as UTF-8.",
    signer: { encoding: "latin1" },
    debtor: "João Gonçalves",
  },
  {
    id: "b64",
    title: "Strict base64 decoder",
    tone: "bad",
    what: "The signer wraps SignatureValue at 76 columns (many libraries do). The verifier decodes it with a strict base64 decoder that rejects line breaks.",
    fix: "Strip whitespace before decoding base64 in SignatureValue/DigestValue (XMLDSig base64 allows it).",
    verifier: { lenientBase64: false },
  },
  {
    id: "prefix",
    title: "A proxy rewrites the ds: prefix",
    tone: "bad",
    what: "An XML gateway re-serializes the signature with prefix dsig: instead of ds:. Same namespace URI, so any DOM says it is the same document, but c14n keeps prefixes: the KeyInfo digest and SignedInfo bytes change.",
    fix: "Treat signed XML as opaque bytes in transit. Use ds: consistently, as in the manual's example.",
    mutate: (x) => x.replace(/ds:/g, "dsig:").replace('xmlns:ds="', 'xmlns:dsig="'),
  },
  {
    id: "digestwrap",
    title: "Reflowing a DigestValue",
    tone: "bad",
    what: "Someone wraps a DigestValue onto two lines. The digest itself still decodes to the same bytes, but DigestValue sits inside SignedInfo, whose canonical bytes are what RSA signed.",
    fix: "Whitespace inside SignedInfo is signed. Only SignatureValue (outside SignedInfo) may be reformatted.",
    mutate: (x) => {
      let n = 0;
      return x.replace(/<ds:DigestValue>([A-Za-z0-9+/]{20})/g, (m, p1) => (++n === 3 ? `<ds:DigestValue>${p1}\n` : m));
    },
  },
  {
    id: "harmless",
    title: "Not a pitfall: quoting and empty tags",
    tone: "ok",
    what: "A different serializer writes single quotes, extra spaces inside tags and explicit end tags for empty elements, including inside SignedInfo. c14n normalizes all of it.",
    fix: "Nothing to fix. This is exactly what canonicalization is for.",
    mutate: (x) =>
      x
        .replace(/<ds:(CanonicalizationMethod|SignatureMethod|DigestMethod|Transform) Algorithm="([^"]+)"\/>/g, "<ds:$1  Algorithm='$2'></ds:$1>")
        .replace('<IntrBkSttlmAmt Ccy="BRL">', "<IntrBkSttlmAmt Ccy='BRL' >"),
  },
];

type R = Awaited<ReturnType<typeof verifyMessage>>;

export function Pitfalls() {
  const [sel, setSel] = useState(PITS[0].id);
  const [res, setRes] = useState<Record<string, R>>({});
  const pit = PITS.find((p) => p.id === sel)!;

  useEffect(() => {
    let live = true;
    (async () => {
      const k = await demoKeys();
      const reg = registryOf(k);
      const out: Record<string, R> = {};
      for (const p of PITS) {
        const { xml } = await signMessage(unsignedPacs008(p.amount ?? "1500.00", p.debtor ?? "Fulano da Silva", p.extraNs ?? ""), k.a.privateKey, SERIAL_A, { ...GOOD_SIGNER, ...p.signer });
        const wire = p.mutate ? p.mutate(xml) : xml;
        out[p.id] = await verifyMessage(wire, reg, { lenientBase64: true, ...p.verifier });
      }
      if (live) setRes(out);
    })();
    return () => {
      live = false;
    };
  }, []);

  const r = res[sel];
  const failed = r?.steps.find((s) => s.status === "fail");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          {PITS.map((p) => {
            const rr = res[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel(p.id)}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                  p.id === sel ? "border-amber-400/60 bg-amber-400/10 text-ink" : "border-line bg-panel-2/50 text-muted hover:text-ink",
                )}
              >
                <span className={clsx("size-2 shrink-0 rounded-full", !rr ? "bg-line" : rr.ok ? "bg-ok" : "bg-bad")} />
                {p.title}
              </button>
            );
          })}
        </div>
        <Panel title={pit.title}>
          <p className="text-sm leading-relaxed text-muted">{pit.what}</p>
          <div className="mt-3 rounded-lg border border-line bg-panel-2/50 px-3 py-2 text-sm text-ink/90">
            <span className="mr-1.5 font-mono text-[11px] text-ok">fix</span>
            {pit.fix}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="verifier says" value={!r ? "…" : r.ok ? "valid" : "rejected"} tone={!r ? "neutral" : r.ok ? "good" : "bad"} />
            <Stat label="fails at" value={!r ? "…" : r.ok ? "—" : (failed?.id.replace("ref-", "digest ") ?? "?")} tone="neutral" />
          </div>
        </Panel>
        <Panel title="Real run: sign → transport → verify" exportUnavailable={!r}>
          <VerifySteps result={r ?? null} pending={!r} />
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: each case actually signs a fresh pacs.008 with your RSA key, applies the bug, and runs the full verifier. Compare where the
        &quot;inclusive c14n&quot; and &quot;proxy rewrites the prefix&quot; cases fail: both corrupt the KeyInfo digest first because it is the
        first Reference checked.
      </p>
    </div>
  );
}
