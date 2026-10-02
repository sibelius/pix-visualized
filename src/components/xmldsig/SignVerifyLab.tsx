"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { recomputeDocDigest, signMessage, unsignedPacs008, verifyMessage, type SignStep, type VStep } from "./dsig";
import { demoKeys, registryOf, SERIAL_A, SERIAL_B } from "./keys";

type Keys = Awaited<ReturnType<typeof demoKeys>>;
type VResult = Awaited<ReturnType<typeof verifyMessage>>;

const STATUS_DOT: Record<VStep["status"], string> = { ok: "bg-ok", fail: "bg-bad", skip: "bg-line" };

const ALL_STEPS = [
  { id: "parse", n: "0", label: "Parse XML" },
  { id: "structure", n: "0", label: "Profile (xmldsig.spi.1.0.xsd)" },
  { id: "ref-KeyInfo", n: "5–6", label: "Digest of <KeyInfo>" },
  { id: "ref-AppHdr", n: "5–6", label: "Digest of <AppHdr> (minus ds:Signature)" },
  { id: "ref-Document", n: "5–6", label: "Digest of <Document>" },
  { id: "sigvalue", n: "8", label: "Decode <SignatureValue>" },
  { id: "cert", n: "9", label: "Look up certificate (issuer + serial)" },
  { id: "rsa", n: "10–11", label: "RSA-SHA256 verify over c14n(SignedInfo)" },
];

export function VerifySteps({ result, pending }: { result: VResult | null; pending?: boolean }) {
  const done = result?.steps ?? [];
  const seen = new Set(done.map((s) => s.id));
  const rest: VStep[] = ALL_STEPS.filter((a) => !seen.has(a.id)).map((a) => ({ ...a, status: "skip", detail: result ? "not reached" : "…" }));
  const rows = [...done, ...rest];
  return (
    <ol className={clsx("space-y-1.5", pending && "opacity-60")}>
      {rows.map((s) => (
        <li key={s.id} className={clsx("rounded-lg border px-2.5 py-1.5", s.status === "fail" ? "border-bad/50 bg-bad/10" : "border-line bg-panel-2/40")}>
          <div className="flex items-center gap-2 text-xs">
            <span className={clsx("size-2 shrink-0 rounded-full", STATUS_DOT[s.status])} />
            <span className="w-10 shrink-0 font-mono text-[10px] text-faint">{s.n}</span>
            <span className={clsx("min-w-0 flex-1", s.status === "skip" ? "text-faint" : "text-ink")}>{s.label}</span>
          </div>
          <div className={clsx("mt-0.5 pl-[3.75rem] text-[11px] break-words", s.status === "fail" ? "text-bad" : "text-faint")}>{s.detail}</div>
          {s.status === "fail" && s.expected && (
            <div className="mt-1 space-y-0.5 pl-[3.75rem] font-mono text-[10.5px] break-all">
              <div className="text-muted">
                DigestValue&nbsp;&nbsp;<span className="text-ink">{s.expected}</span>
              </div>
              <div className="text-muted">
                recomputed&nbsp;&nbsp;&nbsp;<span className="text-bad">{s.computed}</span>
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

const bumpAmount = (x: string) => x.replace(/<IntrBkSttlmAmt[^>]*>/, (m) => m + "9");

type Tamper = { id: string; label: string; kind: "digest" | "signature" | "harmless" | "cert"; apply: (xml: string, k: Keys) => Promise<string> | string };

const TAMPERS: Tamper[] = [
  { id: "amount", label: "one more byte in the amount (1500.00 → 91500.00)", kind: "digest", apply: bumpAmount },
  { id: "amount-redigest", label: "…and recompute the Document DigestValue", kind: "signature", apply: async (x) => recomputeDocDigest(bumpAmount(x)) },
  { id: "hdr", label: "change AppHdr/To to 99999030", kind: "digest", apply: (x) => x.replace("<To><FIId><FinInstnId><Othr><Id>00038166", "<To><FIId><FinInstnId><Othr><Id>99999030") },
  { id: "serial", label: "point KeyInfo at another registered certificate", kind: "digest", apply: (x) => x.replace(SERIAL_A, SERIAL_B) },
  { id: "sigbyte", label: "flip one character of SignatureValue", kind: "signature", apply: (x) => x.replace(/(<ds:SignatureValue>\s*)(.)/, (_, p, c) => p + (c === "A" ? "B" : "A")) },
  { id: "serial-edit", label: "edit the serial in KeyInfo", kind: "digest", apply: (x) => x.replace(SERIAL_A, "11111111111111111111") },
  {
    id: "unknown",
    label: "signer used a certificate never registered",
    kind: "cert",
    apply: async (x, k) => {
      const amt = /<IntrBkSttlmAmt[^>]*>([^<]*)</.exec(x)?.[1] ?? "1500.00";
      return (await signMessage(unsignedPacs008(amt), k.a.privateKey, "11111111111111111111")).xml;
    },
  },
  {
    id: "reformat",
    label: "re-serialize: single quotes, explicit end tags",
    kind: "harmless",
    apply: (x) =>
      x
        .replace(/<ds:(CanonicalizationMethod|SignatureMethod|DigestMethod|Transform) Algorithm="([^"]+)"\/>/g, "<ds:$1 Algorithm='$2' ></ds:$1>")
        .replace('<IntrBkSttlmAmt Ccy="BRL">', "<IntrBkSttlmAmt   Ccy='BRL'>"),
  },
];

const KIND_LABEL: Record<Tamper["kind"], { t: string; c: string }> = {
  digest: { t: "fails at a digest", c: "text-bad" },
  signature: { t: "fails at the signature", c: "text-bad" },
  cert: { t: "fails at the certificate", c: "text-warn" },
  harmless: { t: "still verifies", c: "text-ok" },
};

export function SignVerifyLab() {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [amount, setAmount] = useState("1500.00");
  const [signed, setSigned] = useState<string>("");
  const [steps, setSteps] = useState<SignStep[]>([]);
  const [wire, setWire] = useState<string>("");
  const [result, setResult] = useState<VResult | null>(null);
  const [pending, setPending] = useState(false);
  const [times, setTimes] = useState<{ sign?: number; verify?: number; gen?: number }>({});
  const [lastTamper, setLastTamper] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const seq = useRef(0);

  // generate keys once (in an effect, never during render)
  useEffect(() => {
    const t0 = performance.now();
    demoKeys().then((k) => {
      setKeys(k);
      setTimes((t) => ({ ...t, gen: performance.now() - t0 }));
    });
  }, []);

  const sign = async (k: Keys, amt: string) => {
    const t0 = performance.now();
    const out = await signMessage(unsignedPacs008(/^\d{1,16}\.\d{2}$/.test(amt) ? amt : "1500.00"), k.a.privateKey, SERIAL_A);
    setTimes((t) => ({ ...t, sign: performance.now() - t0 }));
    setSigned(out.xml);
    setSteps(out.steps);
    setWire(out.xml);
    setLastTamper(null);
  };

  useEffect(() => {
    if (keys) sign(keys, amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  // verify whatever is on the wire, on every edit
  useEffect(() => {
    if (!keys || !wire) return;
    const my = ++seq.current;
    setPending(true);
    const t0 = performance.now();
    verifyMessage(wire, registryOf(keys)).then((r) => {
      if (my !== seq.current) return;
      setResult(r);
      setPending(false);
      setTimes((t) => ({ ...t, verify: performance.now() - t0 }));
    });
  }, [wire, keys]);

  const failed = result?.steps.find((s) => s.status === "fail");
  const where = !result ? "—" : result.ok ? "valid" : failed?.id.startsWith("ref-") ? "digest step" : failed?.id === "rsa" ? "signature step" : failed?.id === "cert" ? "certificate" : (failed?.label ?? "error");

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex items-center gap-2 text-xs text-muted">
          amount (IntrBkSttlmAmt)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink"
          />
        </label>
        <Button variant="primary" onClick={() => keys && sign(keys, amount)} disabled={!keys}>
          Sign pacs.008
        </Button>
        <Button onClick={() => setWire(signed)} disabled={!signed || wire === signed}>
          Restore signed message
        </Button>
        <span className="text-xs text-faint">
          {keys ? `RSA-2048 key pair generated in ${times.gen?.toFixed(0) ?? "?"} ms (WebCrypto)` : "generating RSA-2048 key pairs…"}
        </span>
      </Controls>

      <div className="flex flex-wrap gap-2">
        {TAMPERS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={!signed || !keys}
            onClick={async () => {
              if (!keys) return;
              setWire(await t.apply(signed, keys));
              setLastTamper(t.id);
            }}
            className={clsx(
              "rounded-lg border px-2.5 py-1 text-left text-xs transition disabled:opacity-50",
              lastTamper === t.id ? "border-amber-400/60 bg-amber-400/10 text-ink" : "border-line bg-panel-2 text-muted hover:border-faint hover:text-ink",
            )}
          >
            {t.label}
            <span className={clsx("ml-1.5 text-[10px]", KIND_LABEL[t.kind].c)}>· {KIND_LABEL[t.kind].t}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="On the wire (editable)" right={<span className="text-[11px] text-faint">{wire.length} chars · verified on every keystroke</span>}>
          <textarea
            value={wire}
            onChange={(e) => {
              setWire(e.target.value);
              setLastTamper(null);
            }}
            spellCheck={false}
            className="h-[30rem] w-full resize-y rounded-lg border border-line bg-bg p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre text-ink outline-none focus:border-faint"
            placeholder="signing…"
          />
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title="Receiver verifies (Manual sec. 3.3)">
            <VerifySteps result={result} pending={pending} />
          </Panel>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="verdict" value={where} tone={!result ? "neutral" : result.ok ? "good" : "bad"} hint={result?.ok ? "all 3 digests + RSA ok" : "first failing check"} />
            <Stat label="sign · verify" value={`${times.sign?.toFixed(1) ?? "–"} · ${times.verify?.toFixed(1) ?? "–"} ms`} hint="this browser, incl. parse + c14n" />
          </div>
        </div>
      </div>

      <Panel
        title="Signer's steps (Manual sec. 3.2)"
        right={
          <Button variant="ghost" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? "hide" : "show"} details
          </Button>
        }
      >
        <ol className="grid gap-x-6 gap-y-1.5 text-xs md:grid-cols-2">
          {steps.map((s) => (
            <li key={s.n} className="flex min-w-0 gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-faint">{s.n}</span>
              <div className="min-w-0">
                <div className="text-ink">{s.label}</div>
                <div className="break-words text-faint">{s.detail}</div>
                {showSteps && s.c14n && (
                  <pre className="mt-1 max-h-40 overflow-auto rounded border border-line bg-bg p-1.5 font-mono text-[10px] break-all whitespace-pre-wrap text-muted">{s.c14n}</pre>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
      <p className="text-xs text-faint">
        Try: change the amount on the wire. The Document digest no longer matches and verification stops at step 6. Now press &quot;…and
        recompute the Document DigestValue&quot;: the attacker fixes the digest, the digests all pass, and the RSA check fails instead,
        because the DigestValue lives inside SignedInfo, which only the private key can re-sign. The re-serialize button changes many bytes
        yet still verifies.
      </p>
    </div>
  );
}
