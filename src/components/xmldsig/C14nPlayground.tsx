"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";
import { canonicalize, findFirst, parseXml, sha256, toB64, toHex, utf8, type C14nMode } from "./c14n";

type Apex = "root" | "Document";
type Preset = { id: string; label: string; a: string; b: string; apex: Apex; note: string };

const NS = 'xmlns="https://www.bcb.gov.br/pi/pacs.008/1.16"';
const DS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"';

const PRESETS: Preset[] = [
  {
    id: "attrs",
    label: "attribute order & quotes",
    apex: "root",
    a: `<ds:Reference ${DS} URI="" Id="ref-bah">\n <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n</ds:Reference>`,
    b: `<ds:Reference  Id='ref-bah'   ${DS}\n    URI=''  >\n <ds:DigestMethod  Algorithm='http://www.w3.org/2001/04/xmlenc#sha256' />\n</ds:Reference >`,
    note: "Attributes are sorted (namespace URI, then local name), quotes become double quotes, whitespace inside tags disappears. Same bytes, same digest.",
  },
  {
    id: "empty",
    label: "self-closing tags",
    apex: "root",
    a: `<AppHdr ${NS}>\n <MsgDefIdr>pacs.008.spi.1.16</MsgDefIdr>\n <Sgntr/>\n</AppHdr>`,
    b: `<AppHdr ${NS}>\n <MsgDefIdr>pacs.008.spi.1.16</MsgDefIdr>\n <Sgntr></Sgntr>\n</AppHdr>`,
    note: "Canonical XML has no empty-element syntax: <Sgntr/> always becomes <Sgntr></Sgntr>.",
  },
  {
    id: "refs",
    label: "character references, declaration, comments",
    apex: "root",
    a: `<?xml version="1.0" encoding="UTF-8"?>\n<Dbtr ${NS}><!-- payer -->\n <Nm>Jo&#xE3;o &amp; Filhos</Nm>\n</Dbtr>`,
    b: `<Dbtr ${NS}>\n <Nm>João &#38; Filhos</Nm>\n</Dbtr>`,
    note: "The XML declaration and comments are dropped, &#xE3; becomes the character ã (hashed as UTF-8 bytes C3 A3), and & is always re-escaped as &amp;.",
  },
  {
    id: "unusedns",
    label: "redundant namespace declarations",
    apex: "root",
    a: `<Document ${NS}>\n <GrpHdr><NbOfTxs>1</NbOfTxs></GrpHdr>\n</Document>`,
    b: `<Document ${NS} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n <GrpHdr ${NS}><NbOfTxs>1</NbOfTxs></GrpHdr>\n</Document>`,
    note: "Exclusive c14n keeps only namespaces an element visibly uses, once. Flip to inclusive c14n: the unused xmlns:xsi now changes the digest.",
  },
  {
    id: "context",
    label: "same subtree, different ancestors",
    apex: "Document",
    a: `<Envelope ${NS} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:x="urn:vendor:mq">\n <Document>\n  <GrpHdr><NbOfTxs>1</NbOfTxs></GrpHdr>\n </Document>\n</Envelope>`,
    b: `<Envelope ${NS}>\n <Document>\n  <GrpHdr><NbOfTxs>1</NbOfTxs></GrpHdr>\n </Document>\n</Envelope>`,
    note: "Only <Document> is canonicalized. Exclusive c14n ignores the ancestors' unused declarations, so the signature survives being re-wrapped. Switch to inclusive and it no longer does.",
  },
  {
    id: "prefix",
    label: "different prefix (ds: vs dsig:)",
    apex: "root",
    a: `<ds:KeyInfo ${DS} Id="key-info-id">\n <ds:X509Data/>\n</ds:KeyInfo>`,
    b: `<dsig:KeyInfo xmlns:dsig="http://www.w3.org/2000/09/xmldsig#" Id="key-info-id">\n <dsig:X509Data/>\n</dsig:KeyInfo>`,
    note: "Semantically identical (same namespace URI), but c14n never renames prefixes. The prefix is part of the signed bytes.",
  },
  {
    id: "indent",
    label: "pretty-printing",
    apex: "root",
    a: `<PmtId ${NS}><EndToEndId>E9999901020261002133012345678901</EndToEndId></PmtId>`,
    b: `<PmtId ${NS}>\n  <EndToEndId>E9999901020261002133012345678901</EndToEndId>\n</PmtId>`,
    note: "Whitespace between elements is text, and c14n keeps text. Re-indenting a message after it was signed breaks the digest.",
  },
  {
    id: "amount",
    label: "1500.00 vs 1500.0",
    apex: "root",
    a: `<IntrBkSttlmAmt ${NS} Ccy="BRL">1500.00</IntrBkSttlmAmt>`,
    b: `<IntrBkSttlmAmt ${NS} Ccy="BRL">1500.0</IntrBkSttlmAmt>`,
    note: "c14n is not schema-aware: equal decimals with different lexical forms are different text, so different digests.",
  },
];

type Ok = { ok: true; c14n: string; b64: string; hex: string };
type Out = Ok | { ok: false; error: string };

async function run(xml: string, mode: C14nMode, apex: Apex): Promise<Out> {
  try {
    const root = parseXml(xml);
    const el = apex === "root" ? root : findFirst(root, (e) => e.local === "Document");
    if (!el) return { ok: false, error: "no <Document> element to canonicalize" };
    const c = canonicalize(el, { mode });
    const d = await sha256(utf8(c));
    return { ok: true, c14n: c, b64: toB64(d), hex: toHex(d, 8) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function show(s: string, ws: boolean) {
  return ws ? s.replace(/ /g, "·").replace(/\n/g, "↵\n").replace(/\t/g, "→") : s;
}

function Side({ title, xml, setXml, out, ws, diffAt, mode }: { mode: C14nMode; title: string; xml: string; setXml: (s: string) => void; out: Out | null; ws: boolean; diffAt: number }) {
  return (
    <Panel title={title} className="min-w-0">
      <textarea
        value={xml}
        onChange={(e) => setXml(e.target.value)}
        spellCheck={false}
        className="h-44 w-full resize-y rounded-lg border border-line bg-bg p-2 font-mono text-[11.5px] leading-relaxed text-ink outline-none focus:border-faint"
      />
      <div className="mt-3 text-[11px] tracking-wide text-faint uppercase">{mode === "exc" ? "exclusive" : "inclusive"} c14n output</div>
      {out && !out.ok ? (
        <div className="mt-1 rounded-md border border-bad/40 bg-bad/10 px-2 py-1.5 font-mono text-xs text-bad">✗ {out.error}</div>
      ) : out ? (
        <>
          <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-line bg-panel-2/60 p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-ink/90">
            {diffAt >= 0 ? (
              <>
                {show(out.c14n.slice(0, diffAt), ws)}
                <span className="rounded-sm bg-bad/30 text-bad">{show(out.c14n.slice(diffAt, diffAt + 1) || "∅", ws)}</span>
                {show(out.c14n.slice(diffAt + 1), ws)}
              </>
            ) : (
              show(out.c14n, ws)
            )}
          </pre>
          <div className="mt-2 font-mono text-[11px] break-all text-muted">
            <span className="text-faint">SHA-256 (base64) </span>
            {out.b64}
          </div>
        </>
      ) : (
        <div className="mt-1 text-xs text-faint">computing…</div>
      )}
    </Panel>
  );
}

export function C14nPlayground() {
  const [preset, setPreset] = useState(PRESETS[0].id);
  const p = PRESETS.find((x) => x.id === preset)!;
  const [a, setA] = useState(p.a);
  const [b, setB] = useState(p.b);
  const [apex, setApex] = useState<Apex>(p.apex);
  const [mode, setMode] = useState<C14nMode>("exc");
  const [ws, setWs] = useState(true);
  const [outA, setOutA] = useState<Out | null>(null);
  const [outB, setOutB] = useState<Out | null>(null);

  const pick = (id: string) => {
    const q = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setA(q.a);
    setB(q.b);
    setApex(q.apex);
    setMode("exc");
  };

  useEffect(() => {
    let live = true;
    Promise.all([run(a, mode, apex), run(b, mode, apex)]).then(([x, y]) => {
      if (!live) return;
      setOutA(x);
      setOutB(y);
    });
    return () => {
      live = false;
    };
  }, [a, b, mode, apex]);

  const both = outA?.ok && outB?.ok ? { x: outA, y: outB } : null;
  const equal = both ? both.x.b64 === both.y.b64 : null;
  let diffAt = -1;
  if (both && !equal) {
    const s = both.x.c14n;
    const t = both.y.c14n;
    diffAt = 0;
    while (diffAt < s.length && s[diffAt] === t[diffAt]) diffAt++;
  }

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex items-center gap-2 text-xs text-muted">
          preset
          <select
            value={preset}
            onChange={(e) => pick(e.target.value)}
            className="rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-ink"
          >
            {PRESETS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "exc", label: "exclusive c14n (Pix)" },
            { value: "inc", label: "inclusive c14n" },
          ]}
        />
        <Segmented
          value={apex}
          onChange={setApex}
          options={[
            { value: "root", label: "whole snippet" },
            { value: "Document", label: "only <Document>" },
          ]}
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={ws} onChange={(e) => setWs(e.target.checked)} className="accent-amber-400" />
          show whitespace (· ↵)
        </label>
      </Controls>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px]">
        <Side title="A" xml={a} setXml={setA} out={outA} ws={ws} diffAt={diffAt} mode={mode} />
        <Side title="B" xml={b} setXml={setB} out={outB} ws={ws} diffAt={diffAt} mode={mode} />
        <div className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          <Stat
            label="digests"
            value={equal === null ? "—" : equal ? "equal" : "differ"}
            tone={equal === null ? "neutral" : equal ? "good" : "bad"}
            hint={equal === false ? `first difference at char ${diffAt}` : equal ? "a signature over A verifies B" : "fix the XML error"}
          />
          <Stat
            label="raw text"
            value={a === b ? "same" : "different"}
            tone="neutral"
            hint={both ? `${both.x.c14n.length} vs ${both.y.c14n.length} canonical chars` : undefined}
          />
          <Stat label="SHA-256 A" value={<span className="text-sm break-all">{both ? both.x.hex : "—"}</span>} hint="first 8 bytes, hex" />
          <Stat label="SHA-256 B" value={<span className="text-sm break-all">{both ? both.y.hex : "—"}</span>} hint="first 8 bytes, hex" />
        </div>
      </div>
      <p className={clsx("text-sm leading-relaxed text-muted")}>{p.note}</p>
      <p className="text-xs text-faint">
        Try: start with &quot;attribute order &amp; quotes&quot; and keep editing B (add spaces inside tags, swap attributes): the digest
        does not move. Then add one space between two elements, or rename a prefix, and it does. In &quot;same subtree, different
        ancestors&quot;, switch to inclusive c14n to see why Pix chose the exclusive variant.
      </p>
    </div>
  );
}
