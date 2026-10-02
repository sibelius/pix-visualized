"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { PACS002, PACS008, type XNode } from "./envelope";

type Row = {
  key: string;
  path: string;
  depth: number;
  node: XNode;
  kind: "leaf" | "open" | "close" | "folded";
  hidden: number;
};

function count(n: XNode): number {
  return 1 + (n.children ?? []).reduce((a, c) => a + count(c), 0);
}

function flatten(n: XNode, folded: Set<string>, path = "", depth = 0, out: Row[] = [], suffix = ""): Row[] {
  const p = (path ? `${path}/${n.tag}` : n.tag) + suffix;
  // make sibling paths unique (two ds:Reference, etc.)
  const key = `${p}#${out.length}`;
  if (!n.children) {
    out.push({ key, path: p, depth, node: n, kind: "leaf", hidden: 0 });
    return out;
  }
  if (folded.has(p)) {
    out.push({ key, path: p, depth, node: n, kind: "folded", hidden: count(n) - 1 });
    return out;
  }
  out.push({ key, path: p, depth, node: n, kind: "open", hidden: 0 });
  const seen: Record<string, number> = {};
  for (const c of n.children) {
    const dup = n.children.filter((x) => x.tag === c.tag).length > 1;
    seen[c.tag] = (seen[c.tag] ?? 0) + 1;
    flatten(c, folded, p, depth + 1, out, dup ? `[${seen[c.tag]}]` : "");
  }
  out.push({ key: key + "/close", path: p, depth, node: n, kind: "close", hidden: 0 });
  return out;
}

function serialize(n: XNode): string {
  const attrs = Object.entries(n.attrs ?? {})
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  if (n.children) return `<${n.tag}${attrs}>${n.children.map(serialize).join("")}</${n.tag}>`;
  if (n.text === undefined) return `<${n.tag}${attrs}/>`;
  return `<${n.tag}${attrs}>${n.text}</${n.tag}>`;
}

function maxDepth(n: XNode): number {
  return 1 + Math.max(0, ...(n.children ?? []).map(maxDepth));
}

function initialFolds(n: XNode, path = "", out = new Set<string>()) {
  const p = path ? `${path}/${n.tag}` : n.tag;
  if (n.fold) out.add(p);
  n.children?.forEach((c) => initialFolds(c, p, out));
  return out;
}

const DOCS = { pacs008: PACS008, pacs002: PACS002 } as const;
type DocKey = keyof typeof DOCS;

export function EnvelopeExplorer() {
  const [doc, setDoc] = useState<DocKey>("pacs008");
  const root = DOCS[doc];
  const [folded, setFolded] = useState<Set<string>>(() => initialFolds(PACS008));
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>("Envelope/Document/FIToFICstmrCdtTrf/CdtTrfTxInf/PmtId/EndToEndId");

  const rows = useMemo(() => flatten(root, folded), [root, folded]);
  const active = hover ?? pinned;
  const activeRow = rows.find((r) => r.path === active && r.kind !== "close") ?? null;
  const activeText = activeRow?.node.text;
  const bytes = useMemo(() => new TextEncoder().encode(serialize(root)).length, [root]);

  const toggle = (p: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const switchDoc = (d: DocKey) => {
    setDoc(d);
    setFolded(initialFolds(DOCS[d]));
    setPinned(d === "pacs008" ? "Envelope/Document/FIToFICstmrCdtTrf/CdtTrfTxInf/PmtId/EndToEndId" : "Envelope/Document/FIToFIPmtStsRpt/TxInfAndSts/TxSts");
    setHover(null);
  };

  const info = activeRow?.node.info;
  const sameValue = activeText && activeText.length >= 8 ? rows.filter((r) => r.node.text === activeText).length : 0;

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={doc}
          onChange={switchDoc}
          options={[
            { value: "pacs008", label: "pacs.008 (payer PSP → SPI)" },
            { value: "pacs002", label: "pacs.002 (receiver PSP → SPI)" },
          ]}
        />
        <Button variant="ghost" onClick={() => setFolded(new Set())}>
          Expand all
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            setFolded(new Set(["Envelope/AppHdr/Fr", "Envelope/AppHdr/To", "Envelope/AppHdr/Sgntr", "Envelope/Document/FIToFICstmrCdtTrf/GrpHdr"]))
          }
        >
          Collapse plumbing
        </Button>
      </Controls>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={`Envelope · ${doc === "pacs008" ? "pacs.008.spi.1.16" : "pacs.002.spi.1.17"}`} bodyClassName="p-0">
          <div className="max-h-[560px] overflow-auto py-2 font-mono text-[11.5px] leading-[1.55]" onMouseLeave={() => setHover(null)}>
            {rows.map((r) => {
              const isActive = r.path === active && r.kind !== "close";
              const echo = sameValue > 1 && r.node.text === activeText && !isActive;
              const attrs = Object.entries(r.node.attrs ?? {});
              const clickable = r.kind !== "leaf";
              return (
                <div
                  key={r.key}
                  onMouseEnter={() => r.kind !== "close" && setHover(r.path)}
                  onClick={() => {
                    if (clickable) toggle(r.path);
                    setPinned(r.path);
                  }}
                  className={clsx(
                    "cursor-pointer whitespace-pre px-3",
                    isActive ? "bg-[#818cf8]/15" : echo ? "bg-warn/10" : "hover:bg-panel-2",
                  )}
                  style={{ paddingLeft: 12 + r.depth * 14 }}
                >
                  {r.kind === "close" ? (
                    <span className="text-faint">{`</${r.node.tag}>`}</span>
                  ) : (
                    <>
                      {clickable && <span className="mr-1 inline-block w-2 text-faint">{r.kind === "folded" ? "▸" : "▾"}</span>}
                      <span className="text-faint">&lt;</span>
                      <span className="text-[#a5b4fc]">{r.node.tag}</span>
                      {attrs.map(([k, v]) => (
                        <span key={k}>
                          {" "}
                          <span className="text-muted">{k}</span>
                          <span className="text-faint">=</span>
                          <span className="text-ok">&quot;{v}&quot;</span>
                        </span>
                      ))}
                      {r.kind === "leaf" && r.node.text === undefined ? (
                        <span className="text-faint">/&gt;</span>
                      ) : r.kind === "leaf" ? (
                        <>
                          <span className="text-faint">&gt;</span>
                          <span className={clsx(echo ? "text-warn" : "text-ink")}>{r.node.text}</span>
                          <span className="text-faint">{`</${r.node.tag}>`}</span>
                        </>
                      ) : r.kind === "folded" ? (
                        <span className="text-faint">
                          &gt;<span className="mx-1 rounded bg-panel-2 px-1 text-[10px] text-muted">+{r.hidden}</span>
                          {`</${r.node.tag}>`}
                        </span>
                      ) : (
                        <span className="text-faint">&gt;</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="space-y-3 self-start">
          <Panel title="Node">
            {info && activeRow ? (
              <div className="space-y-2 text-sm">
                <div className="break-all font-mono text-[11px] text-faint">{activeRow.path.replace(/^Envelope\//, "")}</div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-base text-[#a5b4fc]">&lt;{activeRow.node.tag}&gt;</span>
                  <span className="text-xs text-muted">{info.iso}</span>
                </div>
                {info.br && (
                  <div className="text-xs">
                    <span className="text-faint">catalog name </span>
                    <span className="font-mono italic text-ink">{info.br}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="multiplicity" value={info.mult} tone={info.mult.startsWith("[1") ? "neutral" : "warn"} hint={info.mult.startsWith("[1") ? "mandatory" : "optional"} />
                  <Stat label="type" value={<span className="break-all text-xs">{info.type ?? "complex"}</span>} />
                </div>
                {info.fmt && <div className="rounded-md bg-panel-2 px-2 py-1 font-mono text-[11px] text-ink/90">{info.fmt}</div>}
                <p className="leading-relaxed text-muted">{info.what}</p>
                {sameValue > 1 && (
                  <p className="text-xs text-warn">This exact value appears {sameValue}× in the envelope (highlighted).</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-faint">Hover a line.</p>
            )}
          </Panel>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="elements" value={count(root)} />
            <Stat label="depth" value={maxDepth(root)} />
            <Stat label="bytes" value={bytes.toLocaleString("en-US")} hint="minified" />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: hover <span className="font-mono">BizMsgIdr</span> and watch <span className="font-mono">MsgId</span> light up (they must match). Expand{" "}
        <span className="font-mono">Sgntr</span> to see the three XMLDSig references. Switch to pacs.002: it gets a fresh MsgId from the receiver,
        but carries the payment&apos;s EndToEndId twice. Click any container to fold it.
      </p>
    </div>
  );
}
